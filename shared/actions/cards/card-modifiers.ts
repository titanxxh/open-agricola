import type { CostModifier, TradeModifier, BonusModifier, CostModifierType } from '../../game/types'

export const CARD_MODIFIERS: Record<string, CostModifier[]> = {
  // A123 Frame Builder: Replace 2 Clay or 2 Stone with 1 Wood
  A123_FrameBuilder: [
    {
      type: 'trade',
      cardId: 'A123_FrameBuilder',
      appliesTo: ['construct', 'renovation'],
      from: { clay: 2 },
      to: { wood: 1 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: 'A123_FrameBuilder',
      appliesTo: ['construct', 'renovation'],
      from: { stone: 2 },
      to: { wood: 1 },
      max: 1,
    },
  ] as TradeModifier[],

  // A143 Stonecutter: 1 Stone less for room/renovation
  A143_Stonecutter: [
    {
      type: 'bonus',
      cardId: 'A143_Stonecutter',
      appliesTo: ['construct', 'renovation'],
      discount: { stone: 1 },
    },
  ] as BonusModifier[],

  // B145 Brushwood Collector: 1 Wood less, 1 Reed more
  B145_BrushwoodCollector: [
    {
      type: 'trade',
      cardId: 'B145_BrushwoodCollector',
      appliesTo: ['construct'],
      from: { reed: 1 },
      to: { wood: 1 },
      max: 1,
    },
  ] as TradeModifier[],

  // A28 Forest School: Replace Food with Wood for occupation costs
  A28_ForestSchool: [
    {
      type: 'trade',
      cardId: 'A28_ForestSchool',
      appliesTo: ['occupation'],
      from: { wood: 1 },
      to: { food: 1 },
      max: 1,
    },
  ] as TradeModifier[],

  // E60 Working Gloves: 1 Wood/Clay/Reed/Stone instead of up to 2 Food
  E60_WorkingGloves: [
    {
      type: 'trade',
      cardId: 'E60_WorkingGloves',
      appliesTo: ['occupation'],
      from: { wood: 1 },
      to: { food: 2 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: 'E60_WorkingGloves',
      appliesTo: ['occupation'],
      from: { clay: 1 },
      to: { food: 2 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: 'E60_WorkingGloves',
      appliesTo: ['occupation'],
      from: { reed: 1 },
      to: { food: 2 },
      max: 1,
    },
    {
      type: 'trade',
      cardId: 'E60_WorkingGloves',
      appliesTo: ['occupation'],
      from: { stone: 1 },
      to: { food: 2 },
      max: 1,
    },
  ] as TradeModifier[],

  // D82 Hunting Trophy: -1 Wood/Clay/Reed/Stone for fences
  D82_HuntingTrophy: [
    {
      type: 'bonus',
      cardId: 'D82_HuntingTrophy',
      appliesTo: ['fencing'],
      discount: { wood: 1, clay: 1, reed: 1, stone: 1 },
    },
  ] as BonusModifier[],

  // B15 Carpenters Bench: -1 Wood for fences
  B15_CarpentersBench: [
    {
      type: 'bonus',
      cardId: 'B15_CarpentersBench',
      appliesTo: ['fencing'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // A16 Rammed Clay: -1 Clay for fences
  A16_RammedClay: [
    {
      type: 'bonus',
      cardId: 'A16_RammedClay',
      appliesTo: ['fencing'],
      discount: { clay: 1 },
    },
  ] as BonusModifier[],

  // A88 Hedge Keeper: -1 Reed for fences
  A88_HedgeKeeper: [
    {
      type: 'bonus',
      cardId: 'A88_HedgeKeeper',
      appliesTo: ['fencing'],
      discount: { reed: 1 },
    },
  ] as BonusModifier[],

  // D88 Millwright: -1 Wood for rooms, -1 for fences, -1 Stone for stables
  D88_Millwright: [
    {
      type: 'bonus',
      cardId: 'D88_Millwright',
      appliesTo: ['construct', 'fencing', 'stables'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // D13 Trowel: -1 Stone for renovation
  D13_Trowel: [
    {
      type: 'bonus',
      cardId: 'D13_Trowel',
      appliesTo: ['renovation'],
      discount: { stone: 1 },
    },
  ] as BonusModifier[],

  // B126 Carpenter: -1 Wood for rooms
  B126_Carpenter: [
    {
      type: 'bonus',
      cardId: 'B126_Carpenter',
      appliesTo: ['construct'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // B13 Carpenters Parlor: -1 Wood for rooms
  B13_CarpentersParlor: [
    {
      type: 'bonus',
      cardId: 'B13_CarpentersParlor',
      appliesTo: ['construct'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // C88 Carpenters Apprentice: -2 Wood for rooms
  C88_CarpentersApprentice: [
    {
      type: 'bonus',
      cardId: 'C88_CarpentersApprentice',
      appliesTo: ['construct'],
      discount: { wood: 2 },
    },
  ] as BonusModifier[],

  // C122 Bricklayer: -1 Clay per room (stacked)
  C122_Bricklayer: [
    {
      type: 'bonus',
      cardId: 'C122_Bricklayer',
      appliesTo: ['construct'],
      discount: { clay: 1 },
    },
  ] as BonusModifier[],

  // D121 Clay Plasterer: -1 Clay for renovation
  D121_ClayPlasterer: [
    {
      type: 'bonus',
      cardId: 'D121_ClayPlasterer',
      appliesTo: ['renovation'],
      discount: { clay: 1 },
    },
  ] as BonusModifier[],

  // C56 Feed Fence: -1 Wood for stables
  C56_FeedFence: [
    {
      type: 'bonus',
      cardId: 'C56_FeedFence',
      appliesTo: ['stables'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // C13 Wood Slide Hammer: -1 Stone for renovation
  C13_WoodSlideHammer: [
    {
      type: 'bonus',
      cardId: 'C13_WoodSlideHammer',
      appliesTo: ['renovation'],
      discount: { stone: 1 },
    },
  ] as BonusModifier[],

  // B128 Plumber: -1 Reed/Clay for renovation
  B128_Plumber: [
    {
      type: 'bonus',
      cardId: 'B128_Plumber',
      appliesTo: ['renovation'],
      discount: { reed: 1, clay: 1 },
    },
  ] as BonusModifier[],

  // E87 Master Renovator: -1 Reed for renovation
  E87_MasterRenovator: [
    {
      type: 'bonus',
      cardId: 'E87_MasterRenovator',
      appliesTo: ['renovation'],
      discount: { reed: 1 },
    },
  ] as BonusModifier[],

  // C14 Straw Thatched Roof: -1 Reed for renovation
  C14_StrawThatchedRoof: [
    {
      type: 'bonus',
      cardId: 'C14_StrawThatchedRoof',
      appliesTo: ['renovation'],
      discount: { reed: 1 },
    },
  ] as BonusModifier[],

  // C37 Dwelling Mound: -1 Grain for plow
  C37_DwellingMound: [
    {
      type: 'bonus',
      cardId: 'C37_DwellingMound',
      appliesTo: ['plow'],
      discount: { grain: 1 },
    },
  ] as BonusModifier[],

  // A14 Carpenters Hammer: -1 Wood for rooms
  A14_CarpentersHammer: [
    {
      type: 'bonus',
      cardId: 'A14_CarpentersHammer',
      appliesTo: ['construct'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // D15 Clay Supports: -1 Clay for rooms
  D15_ClaySupports: [
    {
      type: 'bonus',
      cardId: 'D15_ClaySupports',
      appliesTo: ['construct'],
      discount: { clay: 1 },
    },
  ] as BonusModifier[],

  // A149 House Artist: -1 Reed for rooms
  A149_HouseArtist: [
    {
      type: 'bonus',
      cardId: 'A149_HouseArtist',
      appliesTo: ['construct'],
      discount: { reed: 1 },
    },
  ] as BonusModifier[],

  // A128 Riparian Builder: -1 Food for rooms
  A128_RiparianBuilder: [
    {
      type: 'bonus',
      cardId: 'A128_RiparianBuilder',
      appliesTo: ['construct'],
      discount: { food: 1 },
    },
  ] as BonusModifier[],

  // B155 Art Teacher: Food -> Wood trade for occupations
  B155_ArtTeacher: [
    {
      type: 'trade',
      cardId: 'B155_ArtTeacher',
      appliesTo: ['occupation'],
      from: { wood: 1 },
      to: { food: 1 },
      max: 1,
    },
  ] as TradeModifier[],

  // E150 Rock Beater: -1 Stone for construction
  E150_RockBeater: [
    {
      type: 'bonus',
      cardId: 'E150_RockBeater',
      appliesTo: ['construct'],
      discount: { stone: 1 },
    },
  ] as BonusModifier[],

  // D81 Roof Ladder: -1 Wood for renovation
  D81_RoofLadder: [
    {
      type: 'bonus',
      cardId: 'D81_RoofLadder',
      appliesTo: ['renovation'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // C128 Wooden Hut Extender: -1 Wood for rooms
  C128_WoodenHutExtender: [
    {
      type: 'bonus',
      cardId: 'C128_WoodenHutExtender',
      appliesTo: ['construct'],
      discount: { wood: 1 },
    },
  ] as BonusModifier[],

  // D154 Chimney Sweep: -2 Stone for renovation
  D154_ChimneySweep: [
    {
      type: 'bonus',
      cardId: 'D154_ChimneySweep',
      appliesTo: ['renovation'],
      discount: { stone: 2 },
    },
  ] as BonusModifier[],
}

export const getCardModifiers = (cardId: string): CostModifier[] => {
  return CARD_MODIFIERS[cardId] ?? []
}
