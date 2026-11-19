import { FEASIBILITY_VERDICTS } from '../../../../shared/contract/workshop-generation'
import type { ToolDefinition } from './protocol'
import { REFERENCE_TOOLS, REFERENCE_TOOL_VERSION } from './references'

export const GENERATION_TOOL_VERSION = `${REFERENCE_TOOL_VERSION}/feasibility-v1/artifacts-v3`
const strings = (maxItems: number) => ({ type: 'array', maxItems, items: { type: 'string', maxLength: 1000 } })
export const GENERATION_TOOLS: readonly ToolDefinition[] = [
  ...REFERENCE_TOOLS,
  { type: 'function', function: {
    name: 'report_feasibility',
    description: 'Record your researched verdict before writing artifacts. feasible: the card closes over mechanisms that exist at this commit. needs-info: the request leaves a rule open; list the questions. needs-platform: the card needs a shared mechanism that does not exist; list the gaps. Cite the code or docs each finding rests on. Only a feasible verdict unlocks write_artifacts; report again if research changes the verdict.',
    parameters: {
      type: 'object',
      properties: {
        verdict: { type: 'string', enum: [...FEASIBILITY_VERDICTS] },
        summary: { type: 'string', maxLength: 4000 },
        evidence: { type: 'array', maxItems: 20, items: {
          type: 'object', properties: { path: { type: 'string', maxLength: 300 }, finding: { type: 'string', maxLength: 1000 } },
          required: ['path', 'finding'], additionalProperties: false,
        } },
        gaps: strings(10),
        questions: strings(10),
      },
      required: ['verdict', 'summary', 'evidence', 'gaps', 'questions'], additionalProperties: false,
    },
  } },
  { type: 'function', function: {
    name: 'write_artifacts',
    description: 'Atomically replace the complete card module (native Card Source) and browser behavior tests for this attempt. Invalidates every previous validation and test report. Use run_tests to execute the new pair. This does not adopt the candidate.',
    parameters: {
      type: 'object', properties: { source: { type: 'string', maxLength: 160000 }, tests: { type: 'string', maxLength: 160000 } },
      required: ['source', 'tests'], additionalProperties: false,
    },
  } },
  { type: 'function', function: {
    name: 'run_tests',
    description: 'Validate the current card module\'s structure, then execute its behavior tests in an isolated browser Worker. Returns real diagnostics and failures for you to fix. Requires write_artifacts first. A candidate can be adopted only when validation and every current behavior test pass, including at least one test named "positive: ..." and one named "negative: ...".',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
]
