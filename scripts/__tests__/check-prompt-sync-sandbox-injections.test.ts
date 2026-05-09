import { describe, it, expect } from 'vitest'
import { extractInjectedHelpers, extractSandboxDocInjections } from '../check-prompt-sync'

describe('sandbox-injections sub-check', () => {
  it('extractInjectedHelpers returns helper names from injected-helpers.ts', () => {
    const helpers = extractInjectedHelpers()
    expect(helpers).toContain('gainLeaf')
    expect(helpers).toContain('payLeaf')
    expect(helpers).toContain('spaceHasPlayer')
    expect(helpers).toContain('positionKey')
    expect(helpers).toContain('getCardDefinition')
    expect(helpers).toContain('getCardStack')
    expect(helpers).toContain('readCardExtraData')
  })

  it('extractSandboxDocInjections returns names from CUSTOM_CARD_SANDBOX.md table', () => {
    const docNames = extractSandboxDocInjections()
    expect(docNames).toContain('gainLeaf')
    expect(docNames).toContain('payLeaf')
    expect(docNames).toContain('spaceHasPlayer')
    expect(docNames).toContain('positionKey')
  })

  it('injected-helpers.ts ⊆ sandbox doc (every injected helper is documented)', () => {
    const helpers = extractInjectedHelpers()
    const docNames = new Set(extractSandboxDocInjections())
    for (const h of helpers) {
      expect(docNames.has(h), `${h} from injected-helpers.ts is missing from sandbox doc`).toBe(true)
    }
  })
})
