const OFFICIAL_CARD_ID = /^([A-E]|M)(\d{3})(?:_|$)/

const MOOR_MAJOR_DISPLAY_NUMBERS: Readonly<Record<string, string>> = {
  Major_Moor_HorseSlaughterhouse1: 'M001',
  Major_Moor_HorseSlaughterhouse2: 'M002',
  Major_Moor_Cookhouse1: 'M003',
  Major_Moor_Cookhouse2: 'M004',
  Major_Moor_VillageChurch: 'M005',
  Major_Moor_HeatingOven: 'M006',
  Major_Moor_TiledOven: 'M007',
  Major_Moor_FurnitureStall: 'M008',
  Major_Moor_CeramicsStall: 'M009',
  Major_Moor_BasketStall: 'M010',
  Major_Moor_PeatCharcoalKiln: 'M011',
  Major_Moor_ForestersLodge: 'M012',
  Major_Moor_MuseumOfTheMoors: 'M013',
  Major_Moor_RidingStables: 'M014',
}

export const moorMajorDisplayNumber = (cardId: string): string | undefined =>
  Object.hasOwn(MOOR_MAJOR_DISPLAY_NUMBERS, cardId) ? MOOR_MAJOR_DISPLAY_NUMBERS[cardId] : undefined

/** Deck number printed on an official card face; base major improvements print none. */
export const officialCardDisplayNumber = (cardId: string): string | undefined => {
  const moorMajor = moorMajorDisplayNumber(cardId)
  if (moorMajor) return moorMajor
  const match = OFFICIAL_CARD_ID.exec(cardId)
  return match ? `${match[1]}${match[2]}` : undefined
}

export const officialCardDeck = (cardId: string): string | undefined => {
  if (moorMajorDisplayNumber(cardId)) return 'M'
  return OFFICIAL_CARD_ID.exec(cardId)?.[1]
}
