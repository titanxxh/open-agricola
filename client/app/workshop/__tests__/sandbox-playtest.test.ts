import { describe, expect, it } from 'vitest'
import { bindSandboxPlaytest, sandboxFailureFor, type SandboxStartResult } from '../sandbox-playtest'
import type { PlaytestSource } from '../../../services/llm/generation/request'

const source: PlaytestSource = {
  workspaceId: 'card-db-B', versionId: 'version-B', source: 'tested B', sourceFingerprint: 'fingerprint-B',
  identity: { id: 'CUSTOM_B', name: 'B', type: 'minor' },
}
const response: SandboxStartResult = {
  ok: true, gameInstanceId: 'instance-B', state: { gameSeed: 42 }, customCardsLoaded: 1,
  customCardVersionsLoaded: [{ cardId: source.workspaceId, versionId: source.versionId }],
}

describe('sandbox warning attribution', () => {
  it('uses the tested source for a single-card failure without adding UI proof to the repair input', () => {
    const playtest = bindSandboxPlaytest(response, source)
    expect(sandboxFailureFor(playtest, ['hook failed'])).toEqual({ ...source, gameSeed: 42, errors: ['hook failed'] })
    expect(sandboxFailureFor(playtest, [])).toBeNull()
  })

  it.each([2, undefined])('keeps version confirmation but refuses to attribute global warnings when the card count is %s', customCardsLoaded => {
    const playtest = bindSandboxPlaytest({ ...response, customCardsLoaded }, source)
    expect(playtest?.source.versionId).toBe('version-B')
    expect(playtest?.instanceId).toBe('instance-B')
    expect(sandboxFailureFor(playtest, ['another card failed'])).toBeNull()
  })

  it('does not use the text of an error to guess its owner', () => {
    const playtest = bindSandboxPlaytest({ ...response, customCardsLoaded: 2 }, source)
    expect(sandboxFailureFor(playtest, ['CUSTOM_B: possibly involved'])).toBeNull()
  })

  it.each([
    { gameInstanceId: undefined },
    { customCardVersionsLoaded: [] },
    { customCardVersionsLoaded: [{ cardId: 'other-card', versionId: source.versionId }] },
    { customCardVersionsLoaded: [{ cardId: source.workspaceId, versionId: 'other-version' }] },
    { ok: false },
  ])('requires authoritative instance and fixed-version proof: %j', changes => {
    expect(bindSandboxPlaytest({ ...response, ...changes }, source)).toBeNull()
  })
})
