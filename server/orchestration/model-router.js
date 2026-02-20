/**
 * Model Router
 *
 * Classifies query complexity and selects the cheapest model that can handle it.
 * This keeps Haiku costs for simple questions and reserves Sonnet/Opus for heavy work.
 *
 * Tiers:
 *   low    → claude-haiku-4-20250514     (~20x cheaper than Sonnet)
 *   medium → claude-haiku-4-20250514     (still haiku — medium questions are fine)
 *   high   → configured model (Sonnet / Opus) or Haiku if already configured
 *
 * The router never upgrades past the user's configured model — it only downgrades.
 */

// Signals that the message is asking for something genuinely complex
const HIGH_COMPLEXITY_SIGNALS = [
  'write', 'code', 'implement', 'build', 'create', 'design',
  'analyze', 'analyse', 'research', 'explain', 'debug',
  'refactor', 'architecture', 'plan', 'strategy', 'compare',
  'summarize', 'summarise', 'translate', 'review', 'audit',
  'optimize', 'optimise', 'generate', 'compose', 'outline',
  'step by step', 'walk me through', 'how does', 'why does',
  'how do', 'help me understand', 'what are the',
]

// Short patterns that are definitely low-complexity
const LOW_COMPLEXITY_PATTERNS = [
  /^(what|who|when|where) (is|are|was|were) .{1,60}\??$/i,
  /^(yes|no|ok|okay|sure|thanks|thank you|hello|hi|hey|bye|goodbye)\b/i,
  /^.{1,25}$/,  // very short message
]

/**
 * Classify the complexity of a user message.
 * @param {string} message   - raw user message
 * @param {boolean} hasTools - true if any approved tools are available
 * @returns {'low'|'medium'|'high'}
 */
function classifyComplexity(message, hasTools) {
  if (!message) return 'low'

  const trimmed = message.trim()
  const lower = trimmed.toLowerCase()
  const wordCount = trimmed.split(/\s+/).length

  // Tool use always merits full model — tools imply multi-step agentic work
  if (hasTools) return 'high'

  // High-complexity signals win over length heuristics
  // A short "write it" deserves Sonnet as much as a long prompt does
  if (HIGH_COMPLEXITY_SIGNALS.some(k => lower.includes(k))) return 'high'

  // Only after ruling out complexity signals: check trivially-simple patterns
  if (LOW_COMPLEXITY_PATTERNS.some(p => p.test(trimmed))) return 'low'

  // Medium: longer messages with no recognised complexity signals
  if (wordCount > 25) return 'medium'

  return 'low'
}

// Models that can be downgraded to Haiku
const DOWNGRADEABLE_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-sonnet-4-5-20250929',
  'claude-opus-4-6',
  'claude-opus-4',
]

const HAIKU_MODEL = 'claude-haiku-4-20250514'

/**
 * Select the optimal model for this request.
 *
 * @param {string}  message         - raw user message
 * @param {string}  configuredModel - model set on the credential
 * @param {boolean} hasTools        - whether approved tools exist for this session
 * @returns {{ model: string, complexity: string, routed: boolean, reason: string }}
 *          routed = true means we downgraded from the configured model
 */
function selectModel(message, configuredModel, hasTools) {
  const complexity = classifyComplexity(message, hasTools)
  const canDowngrade = DOWNGRADEABLE_MODELS.includes(configuredModel)

  if (complexity === 'high' || !canDowngrade) {
    return {
      model: configuredModel,
      complexity,
      routed: false,
      reason: complexity === 'high' ? 'high complexity — using configured model' : 'model not downgradeable',
    }
  }

  // low or medium + downgradeable model → use Haiku
  return {
    model: HAIKU_MODEL,
    complexity,
    routed: true,
    reason: `${complexity} complexity — routed to haiku`,
  }
}

module.exports = { classifyComplexity, selectModel, HAIKU_MODEL }
