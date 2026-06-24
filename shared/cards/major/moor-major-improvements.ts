import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import type { CardListenerRegistration } from '../card-listeners'
import type { BonusScoreLevel } from '../card-effects'
import type { CardImpl } from '../registry'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import { discountCardCostCandidate } from '../../actions/payment/internal'
import { queueFutureMeeplesFlow } from '../../actions/effects/internal/future-meeples'
import type { ActionHookPhase } from '../../actions/hooks'
import type { GameState, PlayerState } from '../../contract/types'

const PEAT_CHARCOAL_KILN = 'Major_Moor_PeatCharcoalKiln'
const FORESTERS_LODGE = 'Major_Moor_ForestersLodge'
const RIDING_STABLES = 'Major_Moor_RidingStables'
const MUSEUM_OF_THE_MOORS = 'Major_Moor_MuseumOfTheMoors'

const MUSEUM_DISCOUNT_TARGETS = new Set([
  'Major_Well',
  'Major_Well2',
  'Major_Joinery',
  'Major_Joinery2',
  'Major_Pottery',
  'Major_Pottery2',
  'Major_Basket',
  'Major_Basket2',
  'Major_ClayOven',
  'Major_ClayOven2',
  'Major_StoneOven',
  'Major_StoneOven2',
  FORESTERS_LODGE,
])
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const

const buildGainOnBuyImpl = (cardId: string, gain: Parameters<typeof gainLeaf>[1]) => ({
  effect: {
    id: cardId,
    onBuy: () => gainLeaf(cardId, gain),
  },
})

const buildVillageChurchImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onBuy: () => gainLeaf(cardId, { food: 2 }),
    onHarvest: (_state: GameState, player: PlayerState) => {
      if ((player.resources.fuel ?? 0) < 1) return
      return {
        type: 'seq' as const,
        optional: true,
        children: [
          payLeaf({ cardId, cost: { fuel: 1 } }),
          { type: 'leaf' as const, actionId: 'bonus-vp' as const, sourceCard: cardId },
        ],
      }
    },
  },
})

const buildPeatCharcoalKilnImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    computeCostedBonus: (_state, player) => {
      const fuel = player.resources.fuel ?? 0
      const levels: BonusScoreLevel[] = [{ cost: {}, score: 0 }]
      if (fuel >= 3) levels.push({ cost: { fuel: 3 }, score: 1 })
      if (fuel >= 5) levels.push({ cost: { fuel: 5 }, score: 2 })
      return levels
    },
  },
  reaches: [] as readonly string[],
}) satisfies CardImpl

const buildForestersLodgeImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    computeBonusScore: (_state, player) =>
      (player.farmTerrain ?? []).filter((tile) => tile.kind === 'forest').length,
  },
  reaches: [] as readonly string[],
}) satisfies CardImpl

const museumCostListener: CardListenerRegistration = {
  id: 'moor-museum-of-the-moors-compute-costs',
  cardIds: [MUSEUM_OF_THE_MOORS],
  phases: ['computeCosts' as ActionHookPhase],
  actions: ['improvement'],
  deriveCardCostCandidate: (context, candidate) => {
    if (context.state.enableFarmersOfTheMoor !== true) return null
    if (!context.cardId || !MUSEUM_DISCOUNT_TARGETS.has(context.cardId)) return null
    return BUILDING_RESOURCES
      .map((resource) => discountCardCostCandidate(candidate, MUSEUM_OF_THE_MOORS, { [resource]: 1 }))
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
  },
}

const buildRidingStablesImpl = (cardId: string) => ({
  effect: {
    id: cardId,
    onBuy: (state, player) => {
      if (state.round >= 14) return
      return queueFutureMeeplesFlow(state, {
        cardId,
        playerId: player.id,
        startRound: state.round + 1,
        count: 14,
        resources: { food: 1 },
        actionContext: { resourceCondition: { kind: 'min-resource', resource: 'horse', amount: 2 } },
      })
    },
  },
  reaches: [] as readonly string[],
}) satisfies CardImpl

export const Major_Moor_PeatCharcoalKiln = defineMajorCard({
  meta: {
    id: PEAT_CHARCOAL_KILN,
    name: 'Peat-charcoal Kiln',
    deck: 'major',
    number: 105,
    cost: { stone: 1 },
    vp: 1,
    extraVp: true,
    requiresFarmersOfTheMoor: true,
    moorSpecialActionBonuses: [
      { actionId: 'cut-peat', resource: 'fuel', amount: 1, horseAmount: 2 },
    ],
    desc: [
      '[Special action: Cut Peat]',
      'Gain 1 extra fuel, or 2 extra fuel if you have at least 1 horse.',
      '[Scoring]',
      '3/5 fuel <ARROW> 1/2 bonus points.',
    ],
  } satisfies CardSourceMetaInput,
  impl: buildPeatCharcoalKilnImpl(PEAT_CHARCOAL_KILN),
})

export const Major_Moor_ForestersLodge = defineMajorCard({
  meta: {
    id: FORESTERS_LODGE,
    name: "Forester's Lodge",
    deck: 'major',
    number: 106,
    cost: { wood: 1, clay: 2 },
    vp: 1,
    extraVp: true,
    requiresFarmersOfTheMoor: true,
    moorSpecialActionBonuses: [
      { actionId: 'fell-trees', resource: 'wood', amount: 1, horseAmount: 2 },
    ],
    desc: [
      '[Special action: Fell Trees]',
      'Gain 1 extra wood, or 2 extra wood if you have at least 1 horse.',
      '[Scoring]',
      'Gain 1 bonus point for each forest in your farmyard.',
    ],
  } satisfies CardSourceMetaInput,
  impl: buildForestersLodgeImpl(FORESTERS_LODGE),
})

export const Major_Moor_RidingStables = defineMajorCard({
  meta: {
    id: RIDING_STABLES,
    name: 'Riding Stables',
    deck: 'major',
    number: 107,
    cost: { wood: 2, clay: 1, reed: 1 },
    vp: 3,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      'Place 1 food on each remaining round space.',
      'At the start of each round, gain that food if you have at least 2 horses.',
    ],
  } satisfies CardSourceMetaInput,
  impl: buildRidingStablesImpl(RIDING_STABLES),
})

export const Major_Moor_MuseumOfTheMoors = defineMajorCard({
  meta: {
    id: MUSEUM_OF_THE_MOORS,
    name: 'Museum of the Moors',
    deck: 'major',
    number: 108,
    cost: { clay: 1, reed: 1, stone: 1 },
    vp: 3,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      'Selected major improvements cost you 1 fewer matching building resource.',
    ],
  } satisfies CardSourceMetaInput,
  impl: {
    listeners: [museumCostListener],
    reaches: [...MUSEUM_DISCOUNT_TARGETS] as readonly string[],
  } satisfies CardImpl,
})

export const Major_Moor_HeatingOven = defineMajorCard({
  meta: {
    id: 'Major_Moor_HeatingOven',
    name: 'Furnace',
    deck: 'major',
    number: 109,
    cost: { clay: 1, stone: 1 },
    vp: 1,
    extraVp: false,
    ovenIdentity: true,
    requiresFarmersOfTheMoor: true,
    heatingRoomDiscount: 1,
    desc: [
      'Immediately gain 2 fuel.',
      'When heating, heat 1 fewer room than you have.',
    ],
  } satisfies CardSourceMetaInput,
  impl: buildGainOnBuyImpl('Major_Moor_HeatingOven', { fuel: 2 }),
})

export const Major_Moor_TiledOven = defineMajorCard({
  meta: {
    id: 'Major_Moor_TiledOven',
    name: 'Heating Stove',
    deck: 'major',
    number: 110,
    cost: { clay: 2, stone: 1 },
    vp: 1,
    extraVp: false,
    ovenIdentity: true,
    requiresFarmersOfTheMoor: true,
    heatingFuelCap: 1,
    desc: [
      'Regardless of house size, you need at most 1 fuel to heat your entire home.',
    ],
  } satisfies CardSourceMetaInput,
})

export const Major_Moor_VillageChurch = defineMajorCard({
  meta: {
    id: 'Major_Moor_VillageChurch',
    name: 'Village Church',
    deck: 'major',
    number: 111,
    cost: { wood: 2, stone: 4 },
    vp: 4,
    extraVp: true,
    requiresFarmersOfTheMoor: true,
    desc: [
      'Immediately gain 2 food.',
      '[Harvest]',
      'Once each harvest, you may pay 1 fuel to gain 1 bonus point.',
    ],
  } satisfies CardSourceMetaInput,
  impl: buildVillageChurchImpl('Major_Moor_VillageChurch'),
})

export const Major_Moor_FurnitureStall = defineMajorCard({
  meta: {
    id: 'Major_Moor_FurnitureStall',
    name: 'Furniture Stall',
    deck: 'major',
    number: 112,
    cost: { wood: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      'Exchange wood for the same amount of clay.',
    ],
    exchanges: [
      { from: { wood: 1 }, to: { clay: 1 }, sourceId: 'Major_Moor_FurnitureStall', triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})

export const Major_Moor_CeramicsStall = defineMajorCard({
  meta: {
    id: 'Major_Moor_CeramicsStall',
    name: 'Ceramics Stall',
    deck: 'major',
    number: 113,
    cost: { clay: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      'Exchange clay for the same amount of wood.',
    ],
    exchanges: [
      { from: { clay: 1 }, to: { wood: 1 }, sourceId: 'Major_Moor_CeramicsStall', triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})

export const Major_Moor_BasketStall = defineMajorCard({
  meta: {
    id: 'Major_Moor_BasketStall',
    name: 'Basket Stall',
    deck: 'major',
    number: 114,
    cost: { reed: 1, stone: 1 },
    vp: 2,
    extraVp: false,
    requiresFarmersOfTheMoor: true,
    desc: [
      '[Anytime]',
      'Exchange reed for the same amount of other building resources.',
    ],
    exchanges: [
      { from: { reed: 1 }, to: { wood: 1 }, sourceId: 'Major_Moor_BasketStall', triggers: ['anytime'] },
      { from: { reed: 1 }, to: { clay: 1 }, sourceId: 'Major_Moor_BasketStall', triggers: ['anytime'] },
      { from: { reed: 1 }, to: { stone: 1 }, sourceId: 'Major_Moor_BasketStall', triggers: ['anytime'] },
    ],
  } satisfies CardSourceMetaInput,
})
