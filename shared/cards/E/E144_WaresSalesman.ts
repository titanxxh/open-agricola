import { Occupation } from '../types'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { gainLeaf } from '../helpers/pay-gain-node'
import type { ActionFlow, Resource } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E144_WaresSalesman'

/**
 * E144 Wares Salesman:
 * Each time any player (including you) plays or builds a card that lets them
 * turn building resources into food, the card owner gets 1 of the corresponding
 * building resource and 1 reed (from the general supply).
 *
 * BGA uses a hardcoded grouping of cards to building resources (the card itself
 * does not always have that resource in its cost). Some cards belong to
 * multiple groups; in that case the owner chooses via xor.
 */

type ResourceGain = Partial<Resource>

const WOOD_REED: ResourceGain = { wood: 1, reed: 1 }
const CLAY_REED: ResourceGain = { clay: 1, reed: 1 }
const REED_2: ResourceGain = { reed: 2 }
const STONE_REED: ResourceGain = { stone: 1, reed: 1 }

const WOOD_REED_CARDS = new Set([
  'A108_MushroomCollector',
  'A138_Harpooner',
  'A56_Basket',
  'C153_PatternMaker',
  'A34_Loppers',
  'A48_ShavingHorse',
  'A159_JoineroftheSea',
  'B42_ForestInn',
  'B53_SculptureCourse',
  'B109_PaperMaker',
  'C55_Studio',
  'D155_Ebonist',
  'D133_BeerTentOperator',
  'E54_Contraband',
  'E106_EmergencySeller',
  'Major_Joinery',
])

const CLAY_REED_CARDS = new Set([
  'A40_PottersYard',
  'C55_Studio',
  'D60_LargePottery',
  'D107_Bellfounder',
  'E39_Paintbrush',
  'E54_Contraband',
  'E106_EmergencySeller',
  'Major_Pottery',
])

const REED_2_CARDS = new Set([
  'C139_BasketmakersWife',
  'D46_PelletPress',
  'E54_Contraband',
  'E106_EmergencySeller',
  'E109_BraidMaker',
  'Major_Basket',
])

const STONE_REED_CARDS = new Set([
  'D108_StoneCarver',
  'B53_SculptureCourse',
  'C55_Studio',
  'E54_Contraband',
  'E106_EmergencySeller',
  'E153_StoneSculptor',
])

const stripPrefix = (choice: string): string =>
  choice.replace(/^(minor|major):/, '')

const getGainsFor = (cardId: string): ResourceGain[] => {
  const gains: ResourceGain[] = []
  if (WOOD_REED_CARDS.has(cardId)) gains.push(WOOD_REED)
  if (CLAY_REED_CARDS.has(cardId)) gains.push(CLAY_REED)
  if (REED_2_CARDS.has(cardId)) gains.push(REED_2)
  if (STONE_REED_CARDS.has(cardId)) gains.push(STONE_REED)
  return gains
}

const buildFlow = (cardId: string): ActionFlow | null => {
  const gains = getGainsFor(cardId)
  if (gains.length === 0) return null
  if (gains.length === 1) return gainLeaf(CARD_ID, gains[0]!)
  return {
    type: 'xor',
    children: gains.map((g) => gainLeaf(CARD_ID, g)),
  }
}

const makeListener = (
  actionList: string[],
  listenerId: string,
): CardListenerRegistration => ({
  id: listenerId,
  cardIds: [CARD_ID],
  actions: actionList,
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.choice) return
    const flow = buildFlow(stripPrefix(context.choice))
    if (!flow) return
    return { flow, sourceCard: CARD_ID }
  },
})

export const E144_WaresSalesman = new Occupation({
  id: CARD_ID,
  name: 'Wares Salesman',
  deck: 'E',
  number: 144,
  category: 'BUILDING_RESOURCES_-_REED',
  desc: [
    'Each time any player (including you) plays or builds a card that lets them turn building resources into <FOOD>, you get exactly 1 corresponding building resource and 1 <REED>.',
  ],
  cost: {},
  players: '3+',
})

export const E144_WaresSalesman_impl = {
  listeners: [makeListener(
    ['improvement-any', 'minor-improvement'],
    'E144-wares-salesman-after-improvement',
  ), makeListener(['play-occupation'], 'E144-wares-salesman-after-occupation')],
  reaches: [] as readonly string[],
} satisfies CardImpl
