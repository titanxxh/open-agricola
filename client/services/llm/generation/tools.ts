import type { ToolDefinition } from './protocol'
import { REFERENCE_TOOLS, REFERENCE_TOOL_VERSION } from './references'

export const GENERATION_TOOL_VERSION = `${REFERENCE_TOOL_VERSION}/artifacts-v1`
export const GENERATION_TOOLS: readonly ToolDefinition[] = [
  ...REFERENCE_TOOLS,
  { type: 'function', function: {
    name: 'write_artifacts',
    description: 'Atomically replace the complete card source and browser behavior tests for this attempt. Invalidates every previous validation and test report. Use run_tests to execute the new pair. This does not adopt the candidate.',
    parameters: {
      type: 'object', properties: { source: { type: 'string', maxLength: 160000 }, tests: { type: 'string', maxLength: 160000 } },
      required: ['source', 'tests'], additionalProperties: false,
    },
  } },
  { type: 'function', function: {
    name: 'run_tests',
    description: 'Validate the current card source against the deployed sandbox, then execute its behavior tests in an isolated browser Worker. Returns real diagnostics and failures for you to fix. Requires write_artifacts first. A candidate can be adopted only when validation and at least one current behavior test pass.',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
  } },
]
