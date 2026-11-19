import { describe, expect, it, vi } from 'vitest'
import { WOODPILE_SOURCE } from '../../shared/custom-code/__tests__/native-card-fixture'

const remote = vi.hoisted(() => vi.fn())
vi.mock('../custom-code/client.ts', () => ({ validateAndCompileCustomCodeRemote: remote }))

describe('server validation of a native Card Source (ADR 0052)', () => {
  it('admits the module structurally and never runs it on the server', async () => {
    const { prepareWorkshopAbilityCode, workshopCardJsonFromDefinition } = await import('../workshop-draft-validation.ts')
    const prepared = await prepareWorkshopAbilityCode(WOODPILE_SOURCE, 'CUSTOM_WoodpileHook')
    expect(remote).not.toHaveBeenCalled()
    if (!prepared.ok) throw new Error(prepared.error)
    expect(prepared.codeManifest).toMatchObject({ format: 'native-card-source' })
    expect(prepared.compiledCode).toContain('exports.CUSTOM_WoodpileHook')
    expect(workshopCardJsonFromDefinition(prepared.cardDefinition)).toMatchObject({
      id: 'CUSTOM_WoodpileHook', name: 'Woodpile Hook', card_type: 'minor', cost: { wood: 1 },
    })
  })

  it('reports structural errors as a rejected source', async () => {
    const { prepareWorkshopAbilityCode } = await import('../workshop-draft-validation.ts')
    const prepared = await prepareWorkshopAbilityCode(WOODPILE_SOURCE.replace("'../card-source'", "'../../../server/auth'"), 'CUSTOM_WoodpileHook')
    expect(prepared).toMatchObject({ ok: false, status: 400 })
    expect(remote).not.toHaveBeenCalled()
  })
})
