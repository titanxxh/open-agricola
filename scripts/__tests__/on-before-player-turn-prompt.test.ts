import { describe, expect, it } from 'vitest'
import { getWorkshopSandboxContract } from '../../server/workshop-sandbox-contract'
import { generationSystemPrompt } from '../../client/services/llm/generation/prompt'

describe('onBeforePlayerTurn prompt contract', () => {
  it('tells the generator the hook is a non-flow skip-control exception', () => {
    expect(generationSystemPrompt(getWorkshopSandboxContract(), 'a'.repeat(40))).toMatch(/onBeforePlayerTurn[\s\S]{0,200}skip-control/)
  })
})
