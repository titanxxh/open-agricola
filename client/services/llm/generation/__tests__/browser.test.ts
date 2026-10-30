import { describe, expect, it, vi } from 'vitest'
import type { WorkshopSandboxContract } from '../../../../../shared/contract/workshop-generation'
import { createSandboxPorts } from '../browser'

const contract: WorkshopSandboxContract = {
  format: 2, id: `sandbox-v1:${'a'.repeat(64)}`, runtime: 'server-isolated-vm',
  limits: { executionTimeoutMs: 100, memoryLimitMb: 8 }, effects: ['onBuy'], actions: ['gain'],
  listeners: { actions: ['collect'], phases: ['after'], scopes: ['player'],
    players: { actor: 'player', owner: 'ownerPlayer', effectRecipient: 'effectPlayer' } },
}

describe('deployed browser contract loading', () => {
  it('loads the current descriptor schema from the application API', async () => {
    const apiFetch = vi.fn(async () => Response.json({ ok: true, contract }))
    const signal = new AbortController().signal
    expect(await createSandboxPorts(apiFetch).loadContract(signal)).toEqual(contract)
    expect(apiFetch).toHaveBeenCalledExactlyOnceWith('/api/workshop/sandbox-contract', { signal, cache: 'no-store' })
  })

  it.each([1, 3])('rejects an unsupported descriptor format %i before generation', async format => {
    const apiFetch = vi.fn(async () => Response.json({ ok: true, contract: { ...contract, format } }))
    await expect(createSandboxPorts(apiFetch).loadContract(new AbortController().signal)).rejects.toThrow('deployed sandbox contract')
  })
})
