import { describe, expect, it } from 'vitest'
import { generationSystemPrompt } from '../llm/generation/prompt'
import { GENERATION_TOOLS } from '../llm/generation/tools'
import { allowedReferencePath } from '../llm/generation/references'
import { getWorkshopSandboxContract } from '../../../server/workshop-sandbox-contract'
import { cardEffectHooks } from '../../../shared/projections/card-effect-hooks'
import { sandboxListenerActions } from '../../../shared/custom-code/sandbox-listener-actions'
import { sandboxListenerPhases } from '../../../shared/custom-code/sandbox-listener-phases'
import { sandboxListenerScopes } from '../../../shared/custom-code/sandbox-listener-scopes'
import { SANDBOX_ALLOWED_ACTION_IDS } from '../../../shared/custom-code/sandbox-action-ids'
import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../../../shared/custom-code/runtime-limits'

const contract = getWorkshopSandboxContract()
const commit = 'a'.repeat(40)
const prompt = generationSystemPrompt(contract, commit)

describe('minimal Workshop generation context', () => {
  it('identifies the deployed runtime and the reference commit', () => {
    expect(contract).toEqual({
      format: 2, id: expect.stringMatching(/^sandbox-v1:[a-f0-9]{64}$/), runtime: 'server-isolated-vm',
      limits: { executionTimeoutMs: EXECUTION_TIMEOUT_MS, memoryLimitMb: ISOLATE_MEMORY_LIMIT_MB },
      effects: cardEffectHooks,
      listeners: { actions: sandboxListenerActions, phases: sandboxListenerPhases, scopes: sandboxListenerScopes,
        players: { actor: 'player', owner: 'ownerPlayer', effectRecipient: 'effectPlayer' } },
      actions: SANDBOX_ALLOWED_ACTION_IDS,
    })
    expect(prompt).toContain(commit)
  })

  it('asks for a native Card Source module and embeds no capability list (ADR 0052)', () => {
    expect(prompt).not.toContain(JSON.stringify(contract.actions))
    expect(prompt).not.toContain('DEPLOYED CAPABILITIES')
    expect(prompt).toContain('shared/cards/community/<CARD_ID>.ts')
    expect(prompt).toContain('defineMinorCard({ meta, impl })')
    expect(prompt).toContain('one negative case')
  })

  it('exposes the four tools and lets the model read its real browser test and game APIs', () => {
    expect(GENERATION_TOOLS.map(tool => tool.function.name)).toEqual(['search_references', 'read_reference', 'write_artifacts', 'run_tests'])
    for (const path of ['docs/CARD_AUTHORING.md', 'client/local-sandbox/card-test-runtime.ts']) {
      expect(prompt).toContain(path)
      expect(allowedReferencePath(path)).toBe(true)
    }
  })

  it('keeps the complete system context small enough to leave room for source and tests', () => {
    expect(new TextEncoder().encode(JSON.stringify(contract)).length).toBeLessThan(3000)
    expect(new TextEncoder().encode(prompt).length).toBeLessThan(6000)
  })
})
