import { describe, expect, it } from 'vitest'
import { CARD_DESIGNER_PROMPT_SCHEMA, CARD_DESIGNER_SYSTEM_PROMPT } from '../llmPrompts'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../../../shared/custom-code/sandbox-action-ids'

describe('CARD_DESIGNER_SYSTEM_PROMPT', () => {
  it('does not advertise deprecated before-end dispatch metadata', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain('beforeEndGameDispatchMode')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain("'serial' | 'select'")
  })

  it('renders action ids from the sandbox allowlist', () => {
    for (const actionId of SANDBOX_ALLOWED_ACTION_IDS) {
      expect(CARD_DESIGNER_PROMPT_SCHEMA).toContain(`\`${actionId}\``)
    }
  })

  it('does not append legacy constructor examples', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain('const CARD_DEF = new MinorImprovement')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain('const CARD_DEF = new Occupation')
  })
})
