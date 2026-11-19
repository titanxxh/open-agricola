import { describe, expect, it } from 'vitest'
import { loadNativeCardSource, resolveCardImport } from '../native-card-source.ts'
import { WOODPILE_SOURCE } from '../../../shared/custom-code/__tests__/native-card-fixture.ts'
import * as cardSource from '../../../shared/cards/card-source.ts'

describe('native Card Source loading in the browser Worker', () => {
  it('evaluates the module against the engine modules the Worker bundles', () => {
    const card = loadNativeCardSource(WOODPILE_SOURCE, 'CUSTOM_WoodpileHook')
    expect(card.cardType).toBe('minor')
    expect(card.meta).toMatchObject({ id: 'CUSTOM_WoodpileHook', name: 'Woodpile Hook', kind: 'minor' })
    expect(card.impl.listeners?.[0]).toMatchObject({ id: 'woodpile-hook-fishing', actionSpaces: ['fishing'], phases: ['before'] })
    expect(resolveCardImport('../card-source')).toBe(cardSource)
  })

  it.each([
    [WOODPILE_SOURCE.replace("'../helpers/pay-gain-node'", "'../helpers/missing'"), 'Card import is not an available shared module: ../helpers/missing'],
    [WOODPILE_SOURCE.replace('export const CUSTOM_WoodpileHook', 'const CUSTOM_WoodpileHook'), 'The module must export const CUSTOM_WoodpileHook'],
  ])('reports a loading failure (%#)', (source, error) => {
    expect(() => loadNativeCardSource(source, 'CUSTOM_WoodpileHook')).toThrow(error)
  })
})
