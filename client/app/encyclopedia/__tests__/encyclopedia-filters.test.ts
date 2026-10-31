import { describe, expect, it } from 'vitest'
import type { EncyclopediaEntry } from '../../../../shared/contract/card-encyclopedia'
import {
  EMPTY_ENCYCLOPEDIA_FILTERS,
  encyclopediaFilterOptions,
  filterEncyclopedia,
  normalizeEncyclopediaFilters,
  type EncyclopediaFilters,
} from '../encyclopedia-filters'
import type { EncyclopediaItem } from '../encyclopedia-item'
import { BASEBOARDS, COOKING_HEARTH, MARKET_WORK, WINTER, cardEntry, itemFor, parentEntry } from './fixtures'

const occupation = (cardId: string, displayNumber: string): EncyclopediaEntry => cardEntry(cardId, displayNumber, {
  publicType: 'occupation',
  face: { kind: 'card', cardId, cardType: 'occupation' },
  cost: { kind: 'unlisted' },
})

const PAPER_KNIFE = cardEntry('A003_PaperKnife', 'A003', { cost: { kind: 'printed', paths: [{ wood: 1 }] } })
const DRINKING_TROUGH = cardEntry('A012_DrinkingTrough', 'A012', { cost: { kind: 'printed', paths: [{ clay: 1 }] } })
const ORIENTAL_FIREPLACE = cardEntry('A060_OrientalFireplace', 'A060', {
  cost: { kind: 'unlisted', returnCards: ['Major_Fireplace1', 'Major_Fireplace2', 'Major_CookingHearth1', 'Major_CookingHearth2'] },
  score: { fixed: 1, extraVp: false },
})
const HOMEKEEPER = occupation('A085_Homekeeper', 'A085')
const UPSCALE_LIFESTYLE = cardEntry('B001_UpscaleLifestyle', 'B001', { cost: { kind: 'printed', paths: [{ wood: 3 }] } })
const MANTLEPIECE = cardEntry('B033_Mantlepiece', 'B033', {
  cost: { kind: 'printed', paths: [{ stone: 1 }] },
  score: { fixed: -3, extraVp: true },
})
const FARM_HAND = occupation('B085_FarmHand', 'B085')
const HALF_TIMBERED_HOUSE = cardEntry('C030_HalfTimberedHouse', 'C030', {
  cost: { kind: 'printed', paths: [{ wood: 1, clay: 1, reed: 1, stone: 2 }] },
  score: { fixed: null, extraVp: true },
})
const ABORT_ORIEL = cardEntry('C032_AbortOriel', 'C032', {
  cost: { kind: 'printed', paths: [{ clay: 2 }] },
  score: { fixed: 3, extraVp: false },
})
const JOINERY: EncyclopediaEntry = {
  ...COOKING_HEARTH,
  key: `${COOKING_HEARTH.sourceKind}:Major_Joinery`,
  sourceId: 'Major_Joinery',
  face: { kind: 'card', cardId: 'Major_Joinery', cardType: 'major' },
  text: { name: [{ key: 'cardFaces.Major_Joinery.name' }], body: [{ key: 'cardFaces.Major_Joinery.description' }] },
  cost: { kind: 'printed', paths: [{ wood: 2, stone: 2 }] },
  score: { fixed: 2, extraVp: true },
}
const PR01 = parentEntry('PR01', 'mother', -0.75)
const PR02 = parentEntry('PR02', 'mother', -0.25)
const PS01 = parentEntry('PS01', 'father', null)
const MOOR_START: EncyclopediaEntry = {
  key: 'moorStart:moor-start-1',
  sourceKind: 'moorStart',
  sourceId: 'moor-start-1',
  group: 'moor',
  publicType: 'moorStart',
  displayNumber: null,
  players: null,
  face: { kind: 'moorStart', tiles: [{ row: 0, col: 3, kind: 'forest' }] },
  text: { name: [{ key: 'ui.encyclopedia.moorStart.name', params: { number: 1 } }] },
  cost: { kind: 'notApplicable' },
  score: { fixed: null, extraVp: false },
}

/** Catalog order, as the published catalog sorts it. */
const CATALOG: readonly EncyclopediaItem[] = [
  PAPER_KNIFE, BASEBOARDS, DRINKING_TROUGH, ORIENTAL_FIREPLACE, HOMEKEEPER,
  UPSCALE_LIFESTYLE, MANTLEPIECE, FARM_HAND,
  HALF_TIMBERED_HOUSE, ABORT_ORIEL,
  COOKING_HEARTH, JOINERY,
  PR01, PR02, PS01,
  MARKET_WORK, MOOR_START,
  WINTER,
].map(entry => itemFor(entry))

const filtered = (filters: Partial<EncyclopediaFilters>) =>
  filterEncyclopedia(CATALOG, { ...EMPTY_ENCYCLOPEDIA_FILTERS, ...filters }).map(item => item.entry.sourceId)

describe('filterEncyclopedia', () => {
  it('keeps the whole catalog in order when nothing is selected', () => {
    expect(filterEncyclopedia(CATALOG, EMPTY_ENCYCLOPEDIA_FILTERS)).toEqual(CATALOG)
  })

  it('matches any selected deck within the group', () => {
    expect(filtered({ groups: ['B', 'A'] })).toEqual([
      'A003_PaperKnife', 'A004_Baseboards', 'A012_DrinkingTrough', 'A060_OrientalFireplace', 'A085_Homekeeper',
      'B001_UpscaleLifestyle', 'B033_Mantlepiece', 'B085_FarmHand',
    ])
  })

  it('matches any selected card type, keeping mothers and fathers apart', () => {
    expect(filtered({ types: ['occupation', 'father'] })).toEqual(['A085_Homekeeper', 'B085_FarmHand', 'PS01'])
  })

  it('matches a printed cost option that uses any selected resource, never the card text', () => {
    expect(filtered({ cost: { resources: ['wood', 'clay'], upgradeReturn: false } })).toEqual([
      'A003_PaperKnife', 'A012_DrinkingTrough', 'B001_UpscaleLifestyle',
      'C030_HalfTimberedHouse', 'C032_AbortOriel', 'Major_CookingHearth1', 'Major_Joinery',
    ])
  })

  it('requires every group with a selection to match', () => {
    expect(filtered({
      cost: { resources: ['wood', 'clay'], upgradeReturn: false },
      types: ['minor', 'major'],
      points: { min: 1, max: 3, unlisted: false },
    })).toEqual(['C032_AbortOriel', 'Major_CookingHearth1', 'Major_Joinery'])
    expect(filtered({ groups: ['A', 'B'], cost: { resources: ['wood', 'clay'], upgradeReturn: false } }))
      .toEqual(['A003_PaperKnife', 'A012_DrinkingTrough', 'B001_UpscaleLifestyle'])
  })

  it('finds a card through any one of its alternative printed costs', () => {
    expect(filtered({ cost: { resources: ['food'], upgradeReturn: false } })).toEqual(['A004_Baseboards'])
    expect(filtered({ cost: { resources: ['grain'], upgradeReturn: false } })).toEqual(['A004_Baseboards'])
  })

  it('identifies the return-a-card upgrade on its own and as one more option of the cost group', () => {
    expect(filtered({ cost: { resources: [], upgradeReturn: true } }))
      .toEqual(['A060_OrientalFireplace', 'Major_CookingHearth1'])
    expect(filtered({ cost: { resources: ['clay'], upgradeReturn: true } })).toEqual([
      'A012_DrinkingTrough', 'A060_OrientalFireplace', 'C030_HalfTimberedHouse', 'C032_AbortOriel', 'Major_CookingHearth1',
    ])
  })

  it('never treats an unlisted or inapplicable cost as matching a resource', () => {
    const everyResource = ['wood', 'clay', 'reed', 'stone', 'food', 'grain', 'vegetable', 'sheep', 'boar', 'cattle', 'horse', 'fuel', 'begging', 'fence', 'stable'] as const
    expect(filtered({ cost: { resources: everyResource, upgradeReturn: false } })).toEqual([
      'A003_PaperKnife', 'A004_Baseboards', 'A012_DrinkingTrough', 'B001_UpscaleLifestyle', 'B033_Mantlepiece',
      'C030_HalfTimberedHouse', 'C032_AbortOriel', 'Major_CookingHearth1', 'Major_Joinery',
    ])
  })

  it('includes both bounds of the fixed points range, negative decimals included', () => {
    expect(filtered({ points: { min: -0.75, max: -0.25, unlisted: false } })).toEqual(['PR01', 'PR02'])
    expect(filtered({ points: { min: null, max: -0.75, unlisted: false } })).toEqual(['B033_Mantlepiece', 'PR01'])
    expect(filtered({ points: { min: -0.5, max: null, unlisted: false } })).toEqual([
      'A060_OrientalFireplace', 'C032_AbortOriel', 'Major_CookingHearth1', 'Major_Joinery', 'PR02',
    ])
  })

  it('never reads an unlisted fixed score as 0, father goals included', () => {
    expect(filtered({ points: { min: -1, max: 0.5, unlisted: false } })).toEqual(['PR01', 'PR02'])
    expect(filtered({ points: { min: -100, max: 100, unlisted: false } })).toEqual([
      'A060_OrientalFireplace', 'B033_Mantlepiece', 'C032_AbortOriel', 'Major_CookingHearth1', 'Major_Joinery', 'PR01', 'PR02',
    ])
  })

  it('offers unlisted fixed points as its own option, leaving out material that is never scored', () => {
    expect(filtered({ points: { min: null, max: null, unlisted: true } })).toEqual([
      'A003_PaperKnife', 'A004_Baseboards', 'A012_DrinkingTrough', 'A085_Homekeeper',
      'B001_UpscaleLifestyle', 'B085_FarmHand', 'C030_HalfTimberedHouse', 'PS01',
    ])
    expect(filtered({ types: ['minor', 'major'], points: { min: 2, max: null, unlisted: true } })).toEqual([
      'A003_PaperKnife', 'A004_Baseboards', 'A012_DrinkingTrough', 'B001_UpscaleLifestyle',
      'C030_HalfTimberedHouse', 'C032_AbortOriel', 'Major_Joinery',
    ])
  })

  it('finds a major improvement with both fixed points and a bonus mark through either', () => {
    expect(filtered({ extraVp: true })).toEqual(['B033_Mantlepiece', 'C030_HalfTimberedHouse', 'Major_Joinery'])
    expect(filtered({ types: ['major'], points: { min: 2, max: 2, unlisted: false } })).toEqual(['Major_Joinery'])
    expect(filtered({ points: { min: 2, max: 2, unlisted: false }, extraVp: true })).toEqual(['Major_Joinery'])
  })
})

const NOTHING_SELECTED = {
  groups: [],
  types: [],
  cost: { resources: [], upgradeReturn: false },
  points: { min: null, max: null, unlisted: false },
  extraVp: false,
}

describe('normalizeEncyclopediaFilters', () => {
  it.each([undefined, null, 'A', 42, true, ['A']])('starts from no selection for %j', value => {
    expect(normalizeEncyclopediaFilters(value)).toEqual(NOTHING_SELECTED)
  })

  it('keeps a stored selection as it was', () => {
    const stored = {
      groups: ['A', 'majorMoor'],
      types: ['mother'],
      cost: { resources: ['wood', 'stone'], upgradeReturn: true },
      points: { min: -0.75, max: 2.5, unlisted: true },
      extraVp: true,
    }
    expect(normalizeEncyclopediaFilters(JSON.parse(JSON.stringify(stored)))).toEqual(stored)
  })

  it('drops unknown options and duplicates and lists the rest in option order', () => {
    expect(normalizeEncyclopediaFilters({
      groups: ['seasons', 'Z', 'B', 'A', 'B', 3],
      types: ['father', 'wizard', 'mother', 'minor'],
      cost: { resources: ['clay', 'gold', 'wood', 'clay'] },
    })).toEqual({
      ...NOTHING_SELECTED,
      groups: ['A', 'B', 'seasons'],
      types: ['minor', 'mother', 'father'],
      cost: { resources: ['wood', 'clay'], upgradeReturn: false },
    })
  })

  it('drops values of the wrong kind', () => {
    expect(normalizeEncyclopediaFilters({
      groups: 'A',
      types: { 0: 'minor' },
      cost: { resources: 'wood', upgradeReturn: 'yes' },
      points: { min: '-0.75', max: Number.POSITIVE_INFINITY, unlisted: 1 },
      extraVp: 'true',
    })).toEqual(NOTHING_SELECTED)
    expect(normalizeEncyclopediaFilters({ cost: ['wood'], points: [1, 2], extraVp: true }))
      .toEqual({ ...NOTHING_SELECTED, extraVp: true })
    expect(normalizeEncyclopediaFilters({ points: { min: Number.NaN, max: 0 } }))
      .toEqual({ ...NOTHING_SELECTED, points: { min: null, max: 0, unlisted: false } })
  })
})

describe('encyclopediaFilterOptions', () => {
  it('offers the options the catalog uses, in option order', () => {
    expect(encyclopediaFilterOptions(CATALOG)).toEqual({
      groups: ['A', 'B', 'C', 'majorStandard', 'parents', 'moor', 'seasons'],
      types: ['minor', 'occupation', 'major', 'mother', 'father', 'moorSpecialAction', 'moorStart', 'season'],
      costResources: ['wood', 'clay', 'reed', 'stone', 'food', 'grain'],
      upgradeReturn: true,
    })
    expect(encyclopediaFilterOptions([itemFor(PAPER_KNIFE), itemFor(HOMEKEEPER)])).toEqual({
      groups: ['A'],
      types: ['minor', 'occupation'],
      costResources: ['wood'],
      upgradeReturn: false,
    })
  })
})
