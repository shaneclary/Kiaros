/**
 * Kiaros Task Planner
 *
 * Decomposes a user goal into an ordered list of steps, each referencing
 * a registered tool. The planner does NOT execute steps — that's the
 * executor's job. This separation keeps the human-in-the-loop gate
 * (interrupt-gate.js) between planning and execution.
 *
 * Design principles:
 * - The planner is advisory: Claude still drives tool selection via its
 *   native tool-use API. This module handles multi-step task decomposition
 *   for cases where the user wants to pre-approve a full plan before any
 *   action is taken.
 * - No external calls. All logic is local.
 * - Planner output is always shown to the user before execution begins.
 */

const { listTools } = require('../tools/registry')

/**
 * @typedef {Object} PlanStep
 * @property {number}  index      - 1-based step order
 * @property {string}  toolId     - tool to invoke
 * @property {string}  toolName   - human-readable tool name
 * @property {object}  input      - parameters for the tool
 * @property {string}  rationale  - why this step is needed
 * @property {boolean} requiresApproval - true if step should interrupt for user
 */

/**
 * Build a simple sequential plan from a list of steps returned by Claude.
 *
 * Claude emits tool_use blocks in its response; the orchestration layer
 * collects them into a plan so the user can review the full sequence
 * before any step executes (when interrupt mode = 'plan').
 *
 * @param {Array<{ toolId: string, input: object, rationale?: string }>} rawSteps
 * @returns {PlanStep[]}
 */
function buildPlan(rawSteps) {
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    throw new Error('Plan must have at least one step')
  }

  const tools = listTools()
  const toolMap = Object.fromEntries(tools.map(t => [t.id, t]))

  return rawSteps.map((step, i) => {
    const tool = toolMap[step.toolId]
    if (!tool) throw new Error(`Unknown tool in plan: ${step.toolId}`)

    return {
      index: i + 1,
      toolId: step.toolId,
      toolName: tool.name,
      input: step.input || {},
      rationale: step.rationale || '',
      requiresApproval: tool.riskLevel === 'high' || !tool.reversible,
    }
  })
}

/**
 * Validate a plan against current tool registry state.
 * Returns a list of validation errors (empty array = valid).
 *
 * @param {PlanStep[]} plan
 * @returns {string[]} validation errors
 */
function validatePlan(plan) {
  const tools = listTools()
  const toolMap = Object.fromEntries(tools.map(t => [t.id, t]))
  const errors = []

  for (const step of plan) {
    const tool = toolMap[step.toolId]
    if (!tool) {
      errors.push(`Step ${step.index}: tool "${step.toolId}" not found`)
      continue
    }
    if (!tool.enabled) {
      errors.push(`Step ${step.index}: tool "${tool.name}" is disabled`)
    }
    if (!tool.approved) {
      errors.push(`Step ${step.index}: tool "${tool.name}" scopes not yet approved`)
    }
  }

  return errors
}

/**
 * Summarize a plan as a human-readable string for display in the chat UI
 * or interrupt prompt.
 *
 * @param {PlanStep[]} plan
 * @returns {string}
 */
function summarizePlan(plan) {
  const lines = ['Proposed action plan:']
  for (const step of plan) {
    const risk = step.requiresApproval ? ' ⚠️ requires approval' : ''
    lines.push(`  ${step.index}. ${step.toolName}${risk}`)
    if (step.rationale) lines.push(`     → ${step.rationale}`)
  }
  return lines.join('\n')
}

module.exports = { buildPlan, validatePlan, summarizePlan }
