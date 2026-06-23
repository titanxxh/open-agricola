import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'
import { gainLeaf, payLeaf } from '../helpers/pay-gain-node'
import type { GameState, PlayerState } from '../../contract/types'

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

export const Major_Moor_PeatCharcoalKiln = defineMajorCard({
  meta: {
    id: 'Major_Moor_PeatCharcoalKiln',
    name: 'Peat-charcoal Kiln',
    deck: 'major',
    number: 105,
    cost: { stone: 1 },
    vp: 1,
    extraVp: true,
    desc: [
      '[Special action: Cut Peat]',
      'Gain 1 extra fuel, or 2 extra fuel if you have at least 1 horse.',
      '[Scoring]',
      '3/5 fuel <ARROW> 1/2 bonus points.',
    ],
  } satisfies CardSourceMetaInput,
})

export const Major_Moor_ForestersLodge = defineMajorCard({
  meta: {
    id: 'Major_Moor_ForestersLodge',
    name: "Forester's Lodge",
    deck: 'major',
    number: 106,
    cost: { wood: 1, clay: 2 },
    vp: 1,
    extraVp: true,
    desc: [
      '[Special action: Fell Trees]',
      'Gain 1 extra wood, or 2 extra wood if you have at least 1 horse.',
      '[Scoring]',
      'Gain 1 bonus point for each forest in your farmyard.',
    ],
  } satisfies CardSourceMetaInput,
})

export const Major_Moor_RidingStables = defineMajorCard({
  meta: {
    id: 'Major_Moor_RidingStables',
    name: 'Riding Stables',
    deck: 'major',
    number: 107,
    cost: { wood: 2, clay: 1, reed: 1 },
    vp: 3,
    extraVp: false,
    desc: [
      'Place 1 food on each remaining round space.',
      'At the start of each round, gain that food if you have at least 2 horses.',
    ],
  } satisfies CardSourceMetaInput,
})

export const Major_Moor_MuseumOfTheMoors = defineMajorCard({
  meta: {
    id: 'Major_Moor_MuseumOfTheMoors',
    name: 'Museum of the Moors',
    deck: 'major',
    number: 108,
    cost: { clay: 1, reed: 1, stone: 1 },
    vp: 3,
    extraVp: false,
    desc: [
      'Selected major improvements cost you 1 fewer matching building resource.',
    ],
  } satisfies CardSourceMetaInput,
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
