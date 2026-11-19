import { describe, expect, it } from 'vitest'
import {
  getDefaultClassicDeckIds,
  getEligibleClassicCardIds,
  getSelectableClassicDeckIds,
  normalizeClassicDeckIds,
  withClassicCardDefinitions,
} from '../classic-catalog'
import { getOccupationCard } from '../catalog'
import { classicFixtureCards } from './__fixtures__/classic-definitions'

// ADR 0049 "Classic decks": selectable decks have a ported card, the default prefers CE/CI/CK, and only eligible cards
// (chosen decks, player-count limits) are dealt and counted.
const CE_CI_CZ = [
  ...classicFixtureCards('CE', 'occupation', 2),
  ...classicFixtureCards('CE', 'occupation', 1, { from: 920, players: '3+' }),
  ...classicFixtureCards('CE', 'minor', 2),
  ...classicFixtureCards('CI', 'minor', 1),
  ...classicFixtureCards('CZ', 'occupation', 1),
]

describe('classic decks', () => {
  it('selects the decks with a ported card and defaults to those of CE, CI and CK', () => {
    withClassicCardDefinitions(CE_CI_CZ, () => {
      expect(getSelectableClassicDeckIds()).toEqual(['CE', 'CI', 'CZ'])
      expect(getDefaultClassicDeckIds()).toEqual(['CE', 'CI'])
    })
  })

  it('defaults to every deck with cards when none of CE, CI and CK has any', () => {
    const definitions = [...classicFixtureCards('CZ', 'minor', 1), ...classicFixtureCards('CW', 'occupation', 1)]
    withClassicCardDefinitions(definitions, () => {
      expect(getDefaultClassicDeckIds()).toEqual(['CW', 'CZ'])
    })
  })

  it('normalizes chosen decks like sandbox decks and falls back to the default when none remains', () => {
    withClassicCardDefinitions(CE_CI_CZ, () => {
      expect(normalizeClassicDeckIds([' cz', 'CI', 'ce', 'CZ', 'CK', 'E', 7])).toEqual(['CZ', 'CI', 'CE'])
      expect(normalizeClassicDeckIds(['CK', 'A'])).toEqual(['CE', 'CI'])
      expect(normalizeClassicDeckIds(undefined)).toEqual(['CE', 'CI'])
      expect(normalizeClassicDeckIds('CZ')).toEqual(['CE', 'CI'])
    })
  })

  it('counts only implemented cards of the chosen decks that admit the player count', () => {
    const definitions = [...CE_CI_CZ, ...classicFixtureCards('CE', 'minor', 1, { from: 970, implemented: false })]
    withClassicCardDefinitions(definitions, () => {
      expect(getEligibleClassicCardIds(['CE', 'CI'], 2)).toEqual({
        occupation: ['CE900_FixtureOccupation900', 'CE901_FixtureOccupation901'],
        minor: ['CE950_FixtureMinor950', 'CE951_FixtureMinor951', 'CI950_FixtureMinor950'],
      })
      expect(getEligibleClassicCardIds(['CE'], 3).occupation).toEqual([
        'CE900_FixtureOccupation900', 'CE901_FixtureOccupation901', 'CE920_FixtureOccupation920',
      ])
    })
  })

  it('lets lookups by ID find the injected definitions only while they are in place', () => {
    const id = 'CZ900_FixtureOccupation900'
    withClassicCardDefinitions(CE_CI_CZ, () => expect(getOccupationCard(id)?.id).toBe(id))
    expect(getOccupationCard(id) ?? null).toBeNull()
  })

  it('keeps injected definitions in place until an asynchronous run settles', async () => {
    const id = 'CZ900_FixtureOccupation900'
    const run = withClassicCardDefinitions(CE_CI_CZ, async () => {
      await Promise.resolve()
      return getOccupationCard(id)?.id
    })
    expect(getOccupationCard(id)?.id).toBe(id)
    expect(await run).toBe(id)
    expect(getOccupationCard(id) ?? null).toBeNull()
    await expect(withClassicCardDefinitions(CE_CI_CZ, async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(getOccupationCard(id) ?? null).toBeNull()
  })
})
