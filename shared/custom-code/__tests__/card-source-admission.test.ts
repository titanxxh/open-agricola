import { describe, expect, it } from 'vitest'
import { admitNativeCardSource, isNativeCardSource, resolveCardImportPath } from '../card-source-admission'
import { WOODPILE_SOURCE } from './native-card-fixture'


describe('native Card Source admission (ADR 0052)', () => {
  it('admits an exported native card and reads its meta without executing it', () => {
    expect(isNativeCardSource(WOODPILE_SOURCE)).toBe(true)
    expect(admitNativeCardSource(WOODPILE_SOURCE, 'CUSTOM_WoodpileHook')).toEqual({
      valid: true, errors: [], cardType: 'minor',
      meta: { id: 'CUSTOM_WoodpileHook', name: 'Woodpile Hook', deck: 'community', number: 0, desc: ['Each time you use Fishing, also get 1 <WOOD>.'], cost: { wood: 1 } },
    })
  })

  it('treats the retired sandbox format as not native', () => {
    expect(isNativeCardSource("const CARD_ID = 'CUSTOM_X'\nconst CARD_DEF = { cardType: 'minor', meta: { id: CARD_ID } }\nconst CARD_IMPL = {}")).toBe(false)
  })

  it.each([
    ['../card-source', 'shared/cards/card-source'],
    ['../../domain/player', 'shared/domain/player'],
    ['../../../server/auth', null],
    ['../../../../etc/passwd', null],
    ['../__tests__/fixture', null],
    ['../__stubs__/Stub_PayGainVp', null],
    ['../helpers/pay-gain-node', 'shared/cards/helpers/pay-gain-node'],
    ['../action/common-fishing', 'shared/cards/action/common-fishing'],
    ['../A/A042_ForestLakeHut', null],
    ['../../i18n', null],
    ['typescript', null],
  ])('resolves the import %s to %s', (specifier, path) => {
    expect(resolveCardImportPath(specifier)).toBe(path)
  })

  it.each([
    [WOODPILE_SOURCE.replace("'../helpers/pay-gain-node'", "'../../../server/auth'"), "Import '../../../server/auth' must be a relative path"],
    [WOODPILE_SOURCE.replace('export const CUSTOM_WoodpileHook', 'export const Other'), 'The exported card must be named CUSTOM_WoodpileHook'],
    [WOODPILE_SOURCE + '\nexport const extra = 1\n', 'Declare exactly one export'],
    [WOODPILE_SOURCE.replace("deck: 'community'", "deck: 'A'"), "meta.deck must be 'community'"],
    [WOODPILE_SOURCE.replace("name: 'Woodpile Hook'", 'name: makeName()'), 'meta.name: must be a literal value'],
    [WOODPILE_SOURCE.replace("const CARD_ID = 'CUSTOM_WoodpileHook'", "const CARD_ID = 'CUSTOM_Other'"), "meta.id must be 'CUSTOM_WoodpileHook'"],
    [WOODPILE_SOURCE.replace("defineMinorCard({\n  meta: {", "defineMinorCard({\n  meta: META,\n  extra: {"), 'meta must be written inline as an object literal'],
  ])('rejects a structural problem (%#)', (source, error) => {
    const result = admitNativeCardSource(source, 'CUSTOM_WoodpileHook')
    expect(result.valid).toBe(false)
    expect(result.errors.join('\n')).toContain(error)
  })
})
