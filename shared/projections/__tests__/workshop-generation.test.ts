import { describe, expect, it } from 'vitest'
import { projectAbilityCandidate, projectWorkshopGeneration, projectVisibleMessages, sourceFingerprint } from '../workshop-generation'

const candidate = { id: 'a', kind: 'ability', prompt: 'gain food', createdAt: 1, sourceCode: 'const CARD_IMPL = {}', cardJson: {}, validation: { valid: true } }

describe('private workshop generation projections', () => {
  it('allows only summaries through nested provider, result and candidate objects', () => {
    const secret = 'credential-canary'
    const provenance = { attemptId: 'attempt', endpoint: `https://api.example.com/v1?key=${secret}`, referenceCommit: 'a'.repeat(40),
      apiKey: secret, messages: [{ reasoning_content: secret }], usage: { inputTokens: 3, raw: secret },
      references: [{ path: 'docs/CUSTOM_CARD_SANDBOX.md', startLine: 1, endLine: 20, url: `https://evil.example/${secret}`, body: secret }] }
    const projected = projectWorkshopGeneration({ apiKey: secret, ability: {
      conversation: secret, lastValid: { ...candidate, apiKey: secret, tool_calls: secret, provenance },
      latestResult: { kind: 'failed-source', attemptId: 'b', createdAt: 2, message: 'validation failed',
        failedCandidate: { ...candidate, id: 'b', validation: { valid: true, errors: ['invalid'] }, signature: secret }, raw: secret },
    } })
    expect(JSON.stringify(projected)).not.toContain(secret)
    expect(projected).toMatchObject({ ability: {
      lastValid: { sourceFingerprint: sourceFingerprint(candidate.sourceCode), provenance: { endpoint: '', usage: { outputTokens: null } } },
      latestResult: { failedCandidate: { validation: { valid: false } } },
    } })
  })

  it('does not preserve validation of a different source', () => {
    expect(projectAbilityCandidate({ ...candidate, validation: { valid: true, sourceFingerprint: 'old' } })?.validation.valid).toBe(false)
  })

  it('restores visible chat as interrupted without the private protocol or prompt snapshot', () => {
    expect(projectVisibleMessages([{ role: 'assistant', content: 'Checking references', streaming: true,
      reasoning_content: 'secret', tool_calls: ['private'], signature: 'private', promptSnapshot: 'private' }]))
      .toEqual([{ role: 'assistant', content: 'Checking references', interrupted: true }])
  })
})
