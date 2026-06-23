import { defineMajorCard } from '../card-source'
import type { CardSourceMetaInput } from '../card-source'

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
    desc: [
      'Immediately gain 2 fuel.',
      'When heating, heat 1 fewer room than you have.',
    ],
  } satisfies CardSourceMetaInput,
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
    desc: [
      'Immediately gain 2 food.',
      '[Harvest]',
      'Once each harvest, you may pay 1 fuel to gain 1 bonus point.',
    ],
  } satisfies CardSourceMetaInput,
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
    desc: [
      '[Anytime]',
      'Exchange wood for the same amount of clay.',
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
    desc: [
      '[Anytime]',
      'Exchange clay for the same amount of wood.',
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
    desc: [
      '[Anytime]',
      'Exchange reed for the same amount of other building resources.',
    ],
  } satisfies CardSourceMetaInput,
})
