import { describe, expect, it } from 'vitest'
import { WOODPILE_SOURCE } from '../../shared/custom-code/__tests__/native-card-fixture'
import { prepareWorkshopAbilityCode, workshopCardJsonFromDefinition } from '../workshop-draft-validation.ts'

describe('server validation of a native Card Source (ADR 0052)', () => {
  it('admits the module structurally without running it', async () => {
    const prepared = await prepareWorkshopAbilityCode(WOODPILE_SOURCE, 'CUSTOM_WoodpileHook')
    if (!prepared.ok) throw new Error(prepared.error)
    expect(prepared.codeManifest).toMatchObject({ format: 'native-card-source' })
    expect(prepared.compiledCode).toContain('exports.CUSTOM_WoodpileHook')
    expect(workshopCardJsonFromDefinition(prepared.cardDefinition)).toMatchObject({
      id: 'CUSTOM_WoodpileHook', name: 'Woodpile Hook', card_type: 'minor', cost: { wood: 1 },
    })
  })

  it('reports structural errors as a rejected source', async () => {
    const prepared = await prepareWorkshopAbilityCode(WOODPILE_SOURCE.replace("'../card-source'", "'../../../server/auth'"), 'CUSTOM_WoodpileHook')
    expect(prepared).toMatchObject({ ok: false, status: 400 })
    expect(prepared).not.toHaveProperty('code')
  })

  it('rejects the retired sandbox format and asks for a Card Source module', async () => {
    const prepared = await prepareWorkshopAbilityCode("const CARD_ID = 'CUSTOM_Old'\nconst CARD_DEF = MinorImprovement({ id: CARD_ID, name: 'Old' })\nconst CARD_IMPL = {}", 'CUSTOM_Old')
    expect(prepared).toMatchObject({ ok: false, status: 400, code: 'legacy_card_format', error: expect.stringContaining('Regenerate it as a Card Source module') })
  })
})
