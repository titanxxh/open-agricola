import { describe, expect, it } from 'vitest'
import { CARD_DESIGNER_SYSTEM_PROMPT } from '../llmPrompts'

describe('CARD_DESIGNER_SYSTEM_PROMPT', () => {
  it('does not advertise deprecated before-end dispatch metadata', () => {
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain('beforeEndGameDispatchMode')
    expect(CARD_DESIGNER_SYSTEM_PROMPT).not.toContain("'serial' | 'select'")
  })
})
