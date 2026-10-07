import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { getWorkshopSandboxContract } from '../../server/workshop-sandbox-contract'
import { generationSystemPrompt } from '../../client/services/llm/generation/prompt'

const read = (path: string) => readFileSync(path, 'utf8')

describe('onBeforePlayerTurn documentation contract', () => {
  it('documents the hook as a non-flow skip-control exception', () => {
    const architecture = read('docs/ARCHITECTURE.md')
    const status = read('docs/card_implementation_status.md')
    const sandbox = read('docs/CUSTOM_CARD_SANDBOX.md')

    expect(architecture).toMatch(/onBeforePlayerTurn[\s\S]{0,240}skip-control/)
    expect(architecture).toMatch(/onBeforePlayerTurn[\s\S]{0,240}non-flow/)
    expect(status).toMatch(/onBeforePlayerTurn[\s\S]{0,160}non-flow/)
    expect(sandbox).toMatch(/onBeforePlayerTurn[\s\S]{0,200}skipTurn/)
    expect(sandbox).toMatch(/onBeforePlayerTurn[\s\S]{0,240}ActionFlow/)
    expect(generationSystemPrompt(getWorkshopSandboxContract(), 'a'.repeat(40))).toMatch(/onBeforePlayerTurn[\s\S]{0,200}skip-control/)
  })
})
