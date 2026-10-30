import { describe, expect, it } from 'vitest'
import type { WorkshopAbilityCandidateContract, WorkshopBrowserTestOutcome, WorkshopDraftContract } from '../../contract/workshop'
import { abilityArtifactFingerprint, abilityDraftFingerprint, currentAbilityTesting, isAbilityCandidateReady, projectAbilityCandidate, projectGenerationResult, projectWorkshopGeneration, projectVisibleMessages, sourceFingerprint } from '../workshop-generation'

const sourceCode = 'const CARD_IMPL = {}'
const testCode = 'test("gain food", () => expect(1).to.equal(1))'
const candidate = {
  id: 'a', kind: 'ability', prompt: 'gain food', createdAt: 1, sourceCode, cardJson: {},
  sourceFingerprint: sourceFingerprint(sourceCode),
  validation: { valid: true, sourceFingerprint: sourceFingerprint(sourceCode) },
  testing: { code: testCode, lastRun: {
    artifactFingerprint: abilityArtifactFingerprint(sourceCode, testCode), browserRuntimeId: 'runtime-1',
    outcome: { kind: 'passed', count: 1 },
  } },
} satisfies WorkshopAbilityCandidateContract

describe('private workshop generation projections', () => {
  it('allows only summaries through nested provider, result and candidate objects', () => {
    const secret = 'credential-canary'
    const provenance = { attemptId: 'attempt', endpoint: `https://api.example.com/v1?key=${secret}`, referenceCommit: 'a'.repeat(40),
      apiKey: secret, messages: [{ reasoning_content: secret }], usage: { inputTokens: 3, raw: secret },
      references: [{ path: 'docs/CUSTOM_CARD_SANDBOX.md', startLine: 1, endLine: 20, url: `https://evil.example/${secret}`, body: secret }] }
    const projected = projectWorkshopGeneration({ apiKey: secret, ability: {
      conversation: secret, lastValid: { ...candidate, apiKey: secret, tool_calls: secret, provenance },
      latestResult: { kind: 'failed-source', attemptId: 'b', createdAt: 2, message: 'validation failed',
        failedCandidate: { ...candidate, id: 'b', testing: { ...candidate.testing, lastRun: {
          ...candidate.testing.lastRun, outcome: { kind: 'error', message: 'Test script failed' },
        } }, validation: { valid: true, errors: ['invalid'] }, signature: secret }, raw: secret },
    } })
    expect(JSON.stringify(projected)).not.toContain(secret)
    expect(projected).toMatchObject({ ability: {
      lastValid: { sourceFingerprint: sourceFingerprint(candidate.sourceCode), provenance: { endpoint: '', usage: { outputTokens: null } } },
      latestResult: { failedCandidate: { validation: { valid: true } } },
    } })
  })

  it('does not preserve validation of a different source', () => {
    expect(projectAbilityCandidate({ ...candidate, validation: { valid: true, sourceFingerprint: 'old' } })?.validation.valid).toBe(false)
  })

  it('requires positive browser tests bound to both source and tests and optionally the current runtime', () => {
    expect(isAbilityCandidateReady(candidate, 'runtime-1')).toBe(true)
    const untested = { ...candidate, testing: { code: testCode } }
    const emptyTests = { ...candidate, testing: { ...candidate.testing, code: '' } }
    const zeroTests = { ...candidate, testing: { ...candidate.testing, lastRun: {
      ...candidate.testing.lastRun, outcome: { kind: 'passed', count: 0 } satisfies WorkshopBrowserTestOutcome,
    } } }
    expect(isAbilityCandidateReady(untested)).toBe(false)
    expect(isAbilityCandidateReady(emptyTests)).toBe(false)
    expect(isAbilityCandidateReady({ ...candidate, sourceCode: `${sourceCode};` })).toBe(false)
    expect(isAbilityCandidateReady({ ...candidate, testing: { ...candidate.testing, code: `${testCode};` } })).toBe(false)
    expect(isAbilityCandidateReady({ ...candidate, validation: { valid: true } })).toBe(false)
    expect(isAbilityCandidateReady(candidate, 'runtime-2')).toBe(false)
    expect(isAbilityCandidateReady(zeroTests)).toBe(false)
  })

  it('drops obsolete reports after editing source or tests, retaining the editable test script', () => {
    expect(projectAbilityCandidate({ ...candidate, sourceCode: `${sourceCode};` })?.testing).toEqual({ code: testCode })
    expect(projectAbilityCandidate({ ...candidate, testing: { ...candidate.testing, code: `${testCode};` } })?.testing)
      .toEqual({ code: `${testCode};` })
    expect(abilityArtifactFingerprint('a', 'bc')).not.toBe(abilityArtifactFingerprint('ab', 'c'))
  })

  it('fingerprints adopted test code but excludes reports and pending candidate bookkeeping', () => {
    const draft = { cardId: 'CUSTOM_A', cardType: 'minor', name: 'A', description: 'A', cardJson: {}, effectCode: sourceCode,
      artUrl: null, generation: { ability: { adopted: candidate } },
    } satisfies WorkshopDraftContract
    const fingerprint = abilityDraftFingerprint(draft)
    expect(currentAbilityTesting(draft)).toEqual(candidate.testing)
    expect(currentAbilityTesting({ ...draft, effectCode: `${sourceCode};` })).toEqual({ code: testCode })
    expect(abilityDraftFingerprint({ ...draft, generation: { ability: { adopted: { ...candidate,
      testing: { code: testCode },
    }, lastValid: { ...candidate, id: 'pending' }, latestResult: { kind: 'answer', message: 'New answer' } } } })).toBe(fingerprint)
    expect(abilityDraftFingerprint({ ...draft, generation: { ability: { adopted: { ...candidate,
      testing: { code: 'changed tests' },
    } } } })).not.toBe(fingerprint)
  })

  it('keeps a passing candidate when the same source has a different failed test script', () => {
    const projected = projectWorkshopGeneration({ ability: { lastValid: candidate,
      adopted: { ...candidate, testing: { code: 'older tests' } },
      latestResult: { kind: 'failed-source', attemptId: 'other-tests', failedCandidate: {
        ...candidate, testing: { code: 'different failing tests' },
      } },
    } })
    expect(projected).toHaveProperty('ability.lastValid.testing', candidate.testing)
    expect(projected).toHaveProperty('ability.latestResult.failedCandidate.testing.code', 'different failing tests')
  })

  it('retains statically valid failed test artifacts and limits private reports to bounded summaries', () => {
    const failed = { ...candidate, testing: { code: testCode, lastRun: {
      ...candidate.testing.lastRun, outcome: { kind: 'failed', failures: Array.from({ length: 40 }, () => ({
        name: 'n'.repeat(300), error: 'e'.repeat(3000), privateProtocol: 'secret',
      })), raw: 'secret' },
    } } }
    const result = projectGenerationResult({ kind: 'failed-source', attemptId: 'failed', failedCandidate: failed })
    expect(result?.failedCandidate?.validation.valid).toBe(true)
    const outcome = result?.failedCandidate?.testing?.lastRun?.outcome
    expect(outcome).toEqual({ kind: 'failed', failures: Array.from({ length: 30 }, () => ({ name: 'n'.repeat(200), error: 'e'.repeat(2000) })) })
    expect(JSON.stringify(result)).not.toContain('secret')
    expect(projectGenerationResult({ kind: 'answer', attemptId: 'answer', message: 'Please describe the effect.' })?.kind).toBe('answer')
  })

  it('restores visible chat as interrupted without the private protocol or prompt snapshot', () => {
    expect(projectVisibleMessages([{ role: 'assistant', content: 'Checking references', streaming: true,
      reasoning_content: 'secret', tool_calls: ['private'], signature: 'private', promptSnapshot: 'private' }]))
      .toEqual([{ role: 'assistant', content: 'Checking references', interrupted: true }])
  })
})
