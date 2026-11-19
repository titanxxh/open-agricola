import { describe, expect, it } from 'vitest'
import { bindSandboxPlaytest, sandboxFailureFor } from '../sandbox-playtest'
import type { PlaytestSource } from '../../../services/llm/generation/request'

const source: PlaytestSource = {
  workspaceId: 'card-db-B', versionId: 'version-B', source: 'tested B', sourceFingerprint: 'fingerprint-B',
  identity: { id: 'CUSTOM_B', name: 'B', type: 'minor' },
}
const launch = { instanceId: 'instance-B', seed: 42, cardCount: 1, source }

describe('sandbox warning attribution', () => {
  it('uses the tested source for a single-card failure without adding UI proof to the repair input', () => {
    const playtest = bindSandboxPlaytest(launch)
    expect(sandboxFailureFor(playtest, ['hook failed'])).toEqual({ ...source, gameSeed: 42, errors: ['hook failed'] })
    expect(sandboxFailureFor(playtest, [])).toBeNull()
  })

  it('keeps version confirmation but refuses to attribute global warnings when other cards load too', () => {
    const playtest = bindSandboxPlaytest({ ...launch, cardCount: 2 })
    expect(playtest.source.versionId).toBe('version-B')
    expect(playtest.instanceId).toBe('instance-B')
    expect(sandboxFailureFor(playtest, ['another card failed'])).toBeNull()
  })

  it('does not use the text of an error to guess its owner', () => {
    const playtest = bindSandboxPlaytest({ ...launch, cardCount: 2 })
    expect(sandboxFailureFor(playtest, ['CUSTOM_B: possibly involved'])).toBeNull()
  })
})
