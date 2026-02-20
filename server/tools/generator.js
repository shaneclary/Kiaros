/**
 * Kiaros Dynamic Skill Generator (Phase 11)
 *
 * Turns a natural-language description into a working Node.js tool handler,
 * stores it on disk, and registers it in the tool registry.
 *
 * Security model:
 *   1. Claude generates the code; Kiaros validates it statically.
 *   2. The code is returned to the client for human review BEFORE installation.
 *   3. The user explicitly approves required scopes in the Tools page before
 *      the generated tool can ever be called.
 *   4. The existing interrupt-gate applies at call time.
 *
 * Generated handlers live in server/tools/generated/<toolId>.js and must
 * export a single async `execute(input)` function returning { result, ... }.
 */

const path = require('path')
const fs   = require('fs')
const Anthropic = require('@anthropic-ai/sdk')
const { registerTool } = require('./registry')
const { getDb } = require('../db/client')

const GENERATED_DIR = path.join(__dirname, 'generated')

// Ensure generated_handler_path column exists (idempotent migration)
try {
  getDb().exec('ALTER TABLE tool_registry ADD COLUMN generated_handler_path TEXT')
} catch {
  // Column already present — ignore
}

// ── Safety validator ──────────────────────────────────────────────────────

const DANGEROUS_PATTERNS = [
  /\beval\s*\(/,
  /new\s+Function\s*\(/,
  /require\s*\(\s*['"`][^'"`]*\.\.[^'"`]*['"`]\)/,  // require with path traversal
  /process\s*\.\s*exit/,
  /\bexec\s*\(/,              // child_process.exec
  /\bspawn\s*\(/,             // child_process.spawn
  /\bexecSync\s*\(/,
  /\bspawnSync\s*\(/,
  /__dirname\s*\+/,           // dynamic path building
  /fs\s*\.\s*rmSync|fs\s*\.\s*unlinkSync|fs\s*\.\s*rmdirSync/,  // destructive fs
]

/**
 * Basic static safety check on generated code.
 * Returns an array of violation descriptions (empty = safe to proceed).
 * @param {string} code
 * @returns {string[]}
 */
function validateGeneratedCode(code) {
  const violations = []
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(code)) {
      violations.push(`Potentially dangerous pattern detected: ${pattern.source}`)
    }
  }
  return violations
}

// ── Generation prompt ─────────────────────────────────────────────────────

const ALLOWED_SCOPES = [
  'fs:read', 'fs:write', 'fs:delete',
  'net:fetch', 'net:post',
  'shell:read', 'shell:exec',
  'email:read', 'email:send',
  'calendar:read', 'calendar:write',
  'browser:navigate', 'browser:fill',
]

function buildGenerationPrompt(description) {
  return `You are generating a Kiaros skill tool — a Node.js module that integrates with a personal AI assistant.

Task description: ${description}

Generate a JSON object with EXACTLY this structure:
{
  "id": "skill-short-kebab-name",
  "name": "Human Readable Name (2-4 words)",
  "description": "One sentence describing what this tool does.",
  "requiredScopes": ["net:fetch"],
  "reversible": false,
  "code": "async function execute(input) {\\n  // implementation\\n  return { result: 'output' }\\n}\\nmodule.exports = { execute }"
}

Rules:
- id: must start with "skill-" followed by 2-4 kebab-case words
- requiredScopes: choose ONLY from: ${ALLOWED_SCOPES.join(', ')}
- reversible: true only if the tool's effects can be undone (e.g. file write with backup)
- code: complete, self-contained Node.js. May use built-in modules (fs, path, crypto, https, http).
  Use global fetch for HTTP requests — it is available in Node 18+.
  Do NOT use require('child_process'). Do NOT use eval or new Function.
  Always handle errors: on failure return { error: 'description' }.
  The execute function receives an input object; define its shape based on the task.
  Module exports ONLY { execute }.
- Output ONLY the JSON object. No markdown fences. No explanation.`
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Ask Claude to generate a tool from a natural-language description.
 * Returns the proposal for human review — does NOT install anything.
 *
 * @param {string} description  - natural language description of the desired skill
 * @param {string} apiKey       - Anthropic API key (NEVER log)
 * @param {string} model        - model to use
 * @returns {Promise<{
 *   id: string,
 *   name: string,
 *   description: string,
 *   requiredScopes: string[],
 *   reversible: boolean,
 *   code: string,
 *   violations: string[]
 * }>}
 */
async function generateToolProposal(description, apiKey, model = 'claude-sonnet-4-20250514') {
  if (!description || description.length > 2000) {
    throw new Error('description is required and must be under 2000 chars')
  }

  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: buildGenerationPrompt(description) }]
  })

  const rawJson = response.content.find(b => b.type === 'text')?.text || '{}'
  const cleaned = rawJson.replace(/^```json?\n?/m, '').replace(/\n?```$/m, '').trim()

  let proposal
  try {
    proposal = JSON.parse(cleaned)
  } catch {
    throw new Error('Claude returned malformed JSON. Try again or rephrase the description.')
  }

  // Validate required fields
  if (!proposal.id || !proposal.name || !proposal.code) {
    throw new Error('Generated proposal is missing required fields (id, name, code)')
  }

  // Force id prefix
  if (!proposal.id.startsWith('skill-')) {
    proposal.id = `skill-${proposal.id}`
  }

  // Sanitize scopes against allowed list
  proposal.requiredScopes = (proposal.requiredScopes || []).filter(s => ALLOWED_SCOPES.includes(s))
  if (proposal.requiredScopes.length === 0) proposal.requiredScopes = ['net:fetch']

  // Static safety check
  proposal.violations = validateGeneratedCode(proposal.code)

  return proposal
}

/**
 * Install a reviewed and approved tool proposal onto disk and into the registry.
 *
 * @param {{ id, name, description, requiredScopes, reversible, code }} proposal
 * @returns {{ toolId: string, handlerPath: string }}
 */
function installGeneratedTool(proposal) {
  const { id, name, description, requiredScopes, reversible, code } = proposal

  if (!id || !name || !code) throw new Error('id, name, and code are required')
  if (!id.startsWith('skill-')) throw new Error('Tool id must start with "skill-"')

  // Re-validate before writing to disk
  const violations = validateGeneratedCode(code)
  if (violations.length > 0) {
    throw new Error(`Code failed safety validation:\n${violations.join('\n')}`)
  }

  // Write handler to disk
  const safeFilename = id.replace(/[^a-z0-9-]/gi, '-') + '.js'
  const handlerPath  = path.join(GENERATED_DIR, safeFilename)

  // Wrap in a module header with metadata comment
  const fileContent = `// Kiaros generated skill: ${name}
// Generated at: ${new Date().toISOString()}
// Required scopes: ${(requiredScopes || []).join(', ')}
// DO NOT EDIT manually — regenerate via Tools > Generate Skill

${code}
`
  fs.writeFileSync(handlerPath, fileContent, 'utf-8')

  // Register in tool registry
  const toolId = registerTool({
    id,
    name,
    description: description || `Generated skill: ${name}`,
    requiredScopes: requiredScopes || [],
    reversible: !!reversible,
    sandboxed: true,
    timeoutMs: 15000,
  })

  // Store generated_handler_path
  getDb().prepare(
    'UPDATE tool_registry SET generated_handler_path = ? WHERE id = ?'
  ).run(handlerPath, toolId)

  return { toolId, handlerPath }
}

/**
 * Load a generated handler module (cached after first load).
 * Returns the handler or throws if the path is invalid / outside generated dir.
 */
const handlerCache = new Map()

function loadGeneratedHandler(handlerPath) {
  // Security: ensure path is inside GENERATED_DIR
  const resolved = path.resolve(handlerPath)
  if (!resolved.startsWith(path.resolve(GENERATED_DIR) + path.sep)) {
    throw new Error('Generated handler path is outside the allowed directory')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error(`Generated handler not found: ${resolved}`)
  }
  if (handlerCache.has(resolved)) return handlerCache.get(resolved)

  const mod = require(resolved)
  if (typeof mod.execute !== 'function') {
    throw new Error(`Generated handler at ${resolved} does not export an execute() function`)
  }
  handlerCache.set(resolved, mod)
  return mod
}

module.exports = { generateToolProposal, installGeneratedTool, loadGeneratedHandler }
