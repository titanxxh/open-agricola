import type { EncyclopediaText } from '../contract/card-encyclopedia'
import type { SeasonId } from '../seasons/types'

export type SeasonIconToken = 'WOOD' | 'CLAY' | 'REED' | 'STONE' | 'FOOD' | 'GRAIN' | 'FIELD' | 'FENCE' | 'STABLE'

export type SeasonBoardIcon = {
  readonly token: SeasonIconToken
  readonly text?: string
  readonly dividerAfter?: boolean
  readonly arrowAfter?: boolean
}

export type SeasonBoardAdjustment = {
  readonly id: string
  readonly season: SeasonId
  readonly labelKey?: string
  /** Full sentence for the same change, used where the board icons cannot be shown. */
  readonly descriptionKey?: string
  readonly accumulation?: boolean
  readonly items: readonly SeasonBoardIcon[]
}

export const seasonDisplay = {
  winter: {
    nameKey: 'ui.seasons.winter',
    action: {
      nameKey: 'actions.season-winter-romantic-evening.name',
      descriptionKey: 'actions.season-winter-romantic-evening.description',
    },
  },
  spring: {
    nameKey: 'ui.seasons.spring',
    action: {
      nameKey: 'actions.season-spring-animal-and-fruit.name',
      descriptionKey: 'actions.season-spring-animal-and-fruit.description',
    },
  },
  summer: {
    nameKey: 'ui.seasons.summer',
    action: {
      nameKey: 'actions.season-summer-farmers-market.name',
      descriptionKey: 'actions.season-summer-farmers-market.description',
    },
  },
  autumn: {
    nameKey: 'ui.seasons.autumn',
    action: {
      nameKey: 'actions.season-autumn-thanksgiving.name',
      descriptionKey: 'actions.season-autumn-thanksgiving.description',
    },
  },
} as const satisfies Record<SeasonId, { nameKey: string; action: { nameKey: string; descriptionKey: string } }>

export const seasonBoardNotes = [
  { id: 'winter-fishing', season: 'winter', labelKey: 'ui.seasons.boardCopy.winterFishing' },
  { id: 'summer-no-heating', season: 'summer', labelKey: 'ui.seasons.boardCopy.summerNoHeating' },
] as const satisfies readonly { id: string; season: SeasonId; labelKey: string }[]

export const seasonBoardAdjustments: readonly SeasonBoardAdjustment[] = [
  {
    id: 'winter-basic',
    season: 'winter',
    accumulation: true,
    items: [{ token: 'CLAY', text: '-1' }, { token: 'REED', text: '-1' }],
  },
  {
    id: 'winter-plow',
    season: 'winter',
    labelKey: 'ui.seasons.boardCopy.winterPlowShort',
    descriptionKey: 'ui.seasons.boardCopy.winterPlow',
    items: [{ token: 'FOOD', text: '1', arrowAfter: true }, { token: 'FIELD' }],
  },
  {
    id: 'spring-basic',
    season: 'spring',
    accumulation: true,
    items: [{ token: 'WOOD', text: '-1' }, { token: 'STONE', text: '+1' }],
  },
  {
    id: 'spring-fences',
    season: 'spring',
    labelKey: 'ui.seasons.boardCopy.springFencesShort',
    descriptionKey: 'ui.seasons.boardCopy.springFences',
    items: [{ token: 'FENCE', text: '+2' }],
  },
  {
    id: 'summer-basic',
    season: 'summer',
    accumulation: true,
    items: [{ token: 'CLAY', text: '+1' }, { token: 'STONE', text: '-1' }],
  },
  {
    id: 'summer-fishing',
    season: 'summer',
    labelKey: 'actions.fishing.name',
    descriptionKey: 'ui.seasons.boardCopy.summerFishing',
    items: [{ token: 'FOOD', text: '+1' }],
  },
  {
    id: 'summer-build-rooms',
    season: 'summer',
    labelKey: 'ui.seasons.boardCopy.summerBuildRoomsShort',
    descriptionKey: 'ui.seasons.boardCopy.summerBuildRooms',
    items: [{ token: 'STABLE', text: '1' }],
  },
  {
    id: 'summer-day-laborer',
    season: 'summer',
    labelKey: 'actions.day-laborer.name',
    descriptionKey: 'ui.seasons.boardCopy.summerDayLaborer',
    items: [{ token: 'GRAIN', text: '+1' }],
  },
  {
    id: 'autumn-basic',
    season: 'autumn',
    accumulation: true,
    items: [{ token: 'WOOD', text: '+1' }, { token: 'REED', text: '+1' }],
  },
  {
    id: 'autumn-major',
    season: 'autumn',
    labelKey: 'ui.seasons.boardCopy.autumnMajorShort',
    descriptionKey: 'ui.seasons.boardCopy.autumnMajor',
    items: [
      { token: 'WOOD', text: '-1', dividerAfter: true },
      { token: 'CLAY', dividerAfter: true },
      { token: 'REED', dividerAfter: true },
      { token: 'STONE' },
    ],
  },
]

export const seasonActionCardCopy = {
  winter: {
    family: { labelKey: 'ui.seasons.actionCard.winter.family' },
    harvestPrefix: { labelKey: 'ui.seasons.actionCard.winter.harvestPrefix' },
    foodPerHarvest: 1,
    harvestSuffix: { labelKey: 'ui.seasons.actionCard.winter.harvestSuffix' },
    wood: 2,
  },
  spring: {
    breeding: { labelKey: 'ui.seasons.actionCard.spring.breeding' },
    andOr: { labelKey: 'ui.seasons.actionCard.spring.andOr' },
    sow: { labelKey: 'ui.seasons.actionCard.spring.sow' },
  },
  summer: {
    plow: { labelKey: 'ui.seasons.actionCard.summer.plow' },
    andOr: { labelKey: 'ui.seasons.actionCard.summer.andOr' },
    bakeBread: { labelKey: 'ui.seasons.actionCard.summer.bakeBread' },
    or: { labelKey: 'ui.seasons.actionCard.summer.or' },
    sellGrain: { labelKey: 'ui.seasons.actionCard.summer.sellGrain' },
    grainSold: 1,
    foodPerGrain: 4,
  },
  autumn: {
    fieldPhase: { labelKey: 'ui.seasons.actionCard.autumn.fieldPhase' },
    andOr: { labelKey: 'ui.seasons.actionCard.autumn.andOr' },
    vegetable: 1,
  },
} as const

const key = ({ labelKey }: { labelKey: string }) => ({ key: labelKey })
const literal = (text: string) => ({ literal: text })

const actionCardText = (season: SeasonId): EncyclopediaText => {
  if (season === 'winter') {
    const copy = seasonActionCardCopy.winter
    return [
      key(copy.family), literal('\n'),
      key(copy.harvestPrefix), literal(`${copy.foodPerHarvest} <FOOD>`), key(copy.harvestSuffix), literal(`${copy.wood} <WOOD>`),
    ]
  }
  if (season === 'spring') {
    const copy = seasonActionCardCopy.spring
    return [key(copy.breeding), literal(' '), key(copy.andOr), literal(' '), key(copy.sow)]
  }
  if (season === 'summer') {
    const copy = seasonActionCardCopy.summer
    return [
      key(copy.plow), literal(' '), key(copy.andOr), literal(' '), key(copy.bakeBread), literal(' '), key(copy.or), literal(' '),
      key(copy.sellGrain), literal(` -${copy.grainSold}x <GRAIN> <ARROW> ${copy.foodPerGrain} <FOOD>`),
    ]
  }
  const copy = seasonActionCardCopy.autumn
  return [key(copy.fieldPhase), literal(' '), key(copy.andOr), literal(` +${copy.vegetable} <VEGETABLE>`)]
}

const adjustmentText = (adjustment: SeasonBoardAdjustment): EncyclopediaText => adjustment.descriptionKey
  ? [{ key: adjustment.descriptionKey }]
  : [literal(adjustment.items.map((item) => `${item.text ? `${item.text} ` : ''}<${item.token}>`).join(' '))]

/** Plain-text reading of the season's action card and board changes, with icon tokens kept for display and search. */
export const seasonRuleText = (season: SeasonId): EncyclopediaText => {
  const lines: EncyclopediaText[] = [
    [{ key: seasonDisplay[season].action.nameKey }, literal(' · '), { key: seasonDisplay[season].action.descriptionKey }],
    actionCardText(season),
    ...seasonBoardAdjustments.filter((adjustment) => adjustment.season === season).map(adjustmentText),
    ...seasonBoardNotes.filter((note) => note.season === season).map((note) => [{ key: note.labelKey }]),
  ]
  return lines.flatMap((line, index) => (index === 0 ? line : [literal('\n'), ...line]))
}
