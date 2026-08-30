import type { GameState, MajorSupplyStack } from '../../contract/types'
export type { MajorSupplyStack }

export const standardMajorImprovementIds = [
  'Major_Fireplace1',
  'Major_Fireplace2',
  'Major_CookingHearth1',
  'Major_CookingHearth2',
  'Major_ClayOven',
  'Major_StoneOven',
  'Major_Well',
  'Major_Joinery',
  'Major_Pottery',
  'Major_Basket',
]

export const sixPlayerDuplicateMajorImprovementIds = [
  'Major_Fireplace3',
  'Major_CookingHearth3',
  'Major_Well2',
  'Major_ClayOven2',
  'Major_StoneOven2',
  'Major_Joinery2',
  'Major_Pottery2',
  'Major_Basket2',
]

const sixPlayerMajorSupplyTemplate: readonly MajorSupplyStack[] = [
  { stackId: 'fireplace-1', familyId: 'fireplace', visibleId: 'Major_Fireplace1', cardIds: ['Major_Fireplace1', 'Major_Fireplace3'] },
  { stackId: 'fireplace-2', familyId: 'fireplace', visibleId: 'Major_Fireplace2', cardIds: ['Major_Fireplace2'] },
  { stackId: 'cooking-hearth-1', familyId: 'cooking-hearth', visibleId: 'Major_CookingHearth1', cardIds: ['Major_CookingHearth1', 'Major_CookingHearth3'] },
  { stackId: 'cooking-hearth-2', familyId: 'cooking-hearth', visibleId: 'Major_CookingHearth2', cardIds: ['Major_CookingHearth2'] },
  { stackId: 'clay-oven', familyId: 'clay-oven', visibleId: 'Major_ClayOven', cardIds: ['Major_ClayOven', 'Major_ClayOven2'] },
  { stackId: 'stone-oven', familyId: 'stone-oven', visibleId: 'Major_StoneOven', cardIds: ['Major_StoneOven', 'Major_StoneOven2'] },
  { stackId: 'well', familyId: 'well', visibleId: 'Major_Well', cardIds: ['Major_Well', 'Major_Well2'] },
  { stackId: 'joinery', familyId: 'joinery', visibleId: 'Major_Joinery', cardIds: ['Major_Joinery', 'Major_Joinery2'] },
  { stackId: 'pottery', familyId: 'pottery', visibleId: 'Major_Pottery', cardIds: ['Major_Pottery', 'Major_Pottery2'] },
  { stackId: 'basketmaker', familyId: 'basketmaker', visibleId: 'Major_Basket', cardIds: ['Major_Basket', 'Major_Basket2'] },
]

const farmersOfTheMoorMajorSupplyTemplate: readonly MajorSupplyStack[] = [
  { stackId: 'moor-fireplace-1', familyId: 'fireplace-1', visibleId: 'Major_Fireplace1', cardIds: ['Major_Fireplace1', 'Major_Moor_HorseSlaughterhouse1'] },
  { stackId: 'moor-fireplace-2', familyId: 'fireplace-2', visibleId: 'Major_Fireplace2', cardIds: ['Major_Fireplace2', 'Major_Moor_HorseSlaughterhouse2'] },
  { stackId: 'moor-cooking-hearth-1', familyId: 'cooking-hearth-1', visibleId: 'Major_CookingHearth1', cardIds: ['Major_CookingHearth1', 'Major_Moor_Cookhouse1'] },
  { stackId: 'moor-cooking-hearth-2', familyId: 'cooking-hearth-2', visibleId: 'Major_CookingHearth2', cardIds: ['Major_CookingHearth2', 'Major_Moor_Cookhouse2'] },
  { stackId: 'moor-clay-oven', familyId: 'clay-oven', visibleId: 'Major_ClayOven', cardIds: ['Major_ClayOven', 'Major_Moor_HeatingOven'] },
  { stackId: 'moor-stone-oven', familyId: 'stone-oven', visibleId: 'Major_StoneOven', cardIds: ['Major_StoneOven', 'Major_Moor_TiledOven'] },
  { stackId: 'moor-joinery', familyId: 'joinery', visibleId: 'Major_Joinery', cardIds: ['Major_Joinery', 'Major_Moor_FurnitureStall'] },
  { stackId: 'moor-pottery', familyId: 'pottery', visibleId: 'Major_Pottery', cardIds: ['Major_Pottery', 'Major_Moor_CeramicsStall'] },
  { stackId: 'moor-basketmaker', familyId: 'basketmaker', visibleId: 'Major_Basket', cardIds: ['Major_Basket', 'Major_Moor_BasketStall'] },
  { stackId: 'moor-well', familyId: 'well', visibleId: 'Major_Well', cardIds: ['Major_Well', 'Major_Moor_VillageChurch'] },
  { stackId: 'moor-slot-1', familyId: 'moor-slot-1', visibleId: 'Major_Moor_PeatCharcoalKiln', cardIds: ['Major_Moor_PeatCharcoalKiln', 'Major_Moor_MuseumOfTheMoors'] },
  { stackId: 'moor-slot-2', familyId: 'moor-slot-2', visibleId: 'Major_Moor_ForestersLodge', cardIds: ['Major_Moor_ForestersLodge', 'Major_Moor_RidingStables'] },
]

type CanonicalMajorStack = {
  stackId: string
  familyId: string
  cardIds: readonly string[]
}

type MajorSupplyVariantInput = {
  playerCount: number
  enableFarmersOfTheMoor?: boolean
}

type MajorSupplyState = Pick<GameState, 'availableMajorImprovements' | 'majorImprovementSupply'>

type MajorSupplyVariant = {
  id: string
  matches: (input: MajorSupplyVariantInput) => boolean
  template: readonly MajorSupplyStack[]
}

const majorSupplyVariantRegistry: readonly MajorSupplyVariant[] = [
  {
    id: 'farmers-of-the-moor',
    matches: (input) => input.enableFarmersOfTheMoor === true,
    template: farmersOfTheMoorMajorSupplyTemplate,
  },
  {
    id: 'six-player',
    matches: (input) => input.playerCount >= 6,
    template: sixPlayerMajorSupplyTemplate,
  },
]

const canonicalMajorSupplyTemplates = [
  ...farmersOfTheMoorMajorSupplyTemplate,
  ...sixPlayerMajorSupplyTemplate,
]

const canonicalMajorStackByCard = new Map<string, CanonicalMajorStack>()
for (const stack of canonicalMajorSupplyTemplates) {
  for (const id of stack.cardIds) {
    if (!canonicalMajorStackByCard.has(id)) {
      canonicalMajorStackByCard.set(id, {
        stackId: stack.stackId!,
        familyId: stack.familyId,
        cardIds: stack.cardIds,
      })
    }
  }
}

const canonicalMajorStackByStackId = new Map<string, CanonicalMajorStack>(
  canonicalMajorSupplyTemplates.map((stack) => [
    stack.stackId!,
    { stackId: stack.stackId!, familyId: stack.familyId, cardIds: stack.cardIds },
  ]),
)

export const isMajorImprovementInFamily = (
  cardId: string,
  familyId: string,
): boolean => canonicalMajorStackByCard.get(cardId)?.familyId === familyId

const recomputeVisible = (stack: MajorSupplyStack): MajorSupplyStack => ({
  ...stack,
  visibleId: stack.cardIds[0] ?? null,
})

const cloneTemplate = (template: readonly MajorSupplyStack[]): MajorSupplyStack[] =>
  template.map((stack) => ({
    stackId: stack.stackId,
    familyId: stack.familyId,
    visibleId: stack.visibleId,
    cardIds: [...stack.cardIds],
  }))

const findMajorSupplyStackIndex = (
  supply: readonly MajorSupplyStack[],
  canonical: CanonicalMajorStack,
): number => {
  const byStackId = supply.findIndex((stack) => stack.stackId === canonical.stackId)
  if (byStackId >= 0) return byStackId

  const byCurrentCard = supply.findIndex(
    (stack) =>
      stack.cardIds.some((id) => canonical.cardIds.includes(id)) ||
      canonical.cardIds.includes(stack.visibleId ?? ''),
  )
  if (byCurrentCard >= 0) return byCurrentCard

  const sameFamily = supply
    .map((stack, index) => ({ stack, index }))
    .filter(({ stack }) => stack.familyId === canonical.familyId)
  return sameFamily.length === 1 ? sameFamily[0]!.index : -1
}

const findCanonicalMajorStackForReturn = (
  supply: readonly MajorSupplyStack[],
  cardId: string,
): CanonicalMajorStack | undefined => {
  for (const stack of supply) {
    if (!stack.stackId) continue
    const canonical = canonicalMajorStackByStackId.get(stack.stackId)
    if (canonical?.cardIds.includes(cardId)) return canonical
  }
  return canonicalMajorStackByCard.get(cardId)
}

export const createMajorImprovementSupply = (
  playerCount: number,
  options: { enableFarmersOfTheMoor?: boolean } = {},
): MajorSupplyStack[] | undefined => {
  const variant = majorSupplyVariantRegistry.find((candidate) =>
    candidate.matches({ playerCount, ...options }),
  )
  return variant ? cloneTemplate(variant.template) : undefined
}

export const getVisibleMajorImprovementIds = (
  supply: readonly MajorSupplyStack[] | undefined,
): string[] | undefined => {
  if (!supply) return undefined
  return supply.map((stack) => stack.visibleId).filter((id): id is string => !!id)
}

export const getAvailableMajorImprovementIds = (
  state: MajorSupplyState,
): string[] =>
  getVisibleMajorImprovementIds(state.majorImprovementSupply) ??
  [...state.availableMajorImprovements]

export const isMajorImprovementAvailable = (
  state: MajorSupplyState,
  cardId: string,
): boolean => getAvailableMajorImprovementIds(state).includes(cardId)

export const filterAvailableMajorImprovementIds = (
  state: MajorSupplyState,
  cardIds: readonly string[],
): string[] => {
  const available = new Set(getAvailableMajorImprovementIds(state))
  return cardIds.filter((cardId) => available.has(cardId))
}

export const syncAvailableMajorImprovementsFromSupply = (
  state: MajorSupplyState,
): void => {
  const visible = getVisibleMajorImprovementIds(state.majorImprovementSupply)
  if (visible) state.availableMajorImprovements = visible
}

export const takeMajorImprovementFromSupply = (
  state: MajorSupplyState,
  cardId: string,
): void => {
  if (!state.majorImprovementSupply) {
    state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== cardId)
    return
  }
  state.majorImprovementSupply = state.majorImprovementSupply.map((stack) =>
    recomputeVisible({
      ...stack,
      cardIds: stack.cardIds.filter((id) => id !== cardId),
    }),
  )
  syncAvailableMajorImprovementsFromSupply(state)
}

export const returnMajorImprovementToSupply = (
  state: MajorSupplyState,
  cardId: string,
): void => {
  if (!state.majorImprovementSupply) {
    if (!state.availableMajorImprovements.includes(cardId)) state.availableMajorImprovements.push(cardId)
    return
  }
  const canonical = findCanonicalMajorStackForReturn(state.majorImprovementSupply, cardId)
  if (!canonical) {
    if (!state.availableMajorImprovements.includes(cardId)) state.availableMajorImprovements.push(cardId)
    return
  }
  const stackIndex = findMajorSupplyStackIndex(state.majorImprovementSupply, canonical)
  if (stackIndex < 0) return

  state.majorImprovementSupply = state.majorImprovementSupply.map((stack, index) => {
    if (index !== stackIndex) return stack
    const ids = Array.from(new Set([...stack.cardIds, cardId]))
      .sort((a, b) => canonical.cardIds.indexOf(a) - canonical.cardIds.indexOf(b))
    return recomputeVisible({ ...stack, stackId: canonical.stackId, familyId: canonical.familyId, cardIds: ids })
  })
  syncAvailableMajorImprovementsFromSupply(state)
}

export const moveMajorImprovementToSupplyTop = (
  state: MajorSupplyState,
  cardId: string,
): void => {
  if (!state.majorImprovementSupply) return
  state.majorImprovementSupply = state.majorImprovementSupply.map((stack) => {
    if (!stack.cardIds.includes(cardId)) return stack
    return recomputeVisible({
      ...stack,
      cardIds: [
        cardId,
        ...stack.cardIds.filter((id) => id !== cardId),
      ],
    })
  })
  syncAvailableMajorImprovementsFromSupply(state)
}

export const swapMajorImprovementWithSupply = (
  state: MajorSupplyState,
  fromCardId: string,
  toCardId: string,
): void => {
  if (!state.majorImprovementSupply) {
    const boardIndex = state.availableMajorImprovements.indexOf(toCardId)
    state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== toCardId)
    if (!state.availableMajorImprovements.includes(fromCardId)) {
      state.availableMajorImprovements.splice(Math.max(0, boardIndex), 0, fromCardId)
    }
    return
  }
  takeMajorImprovementFromSupply(state, toCardId)
  returnMajorImprovementToSupply(state, fromCardId)
}

export const normalizeMajorImprovementSupply = (
  rawSupply: unknown,
  takenMajorIds: ReadonlySet<string>,
): MajorSupplyStack[] | undefined => {
  if (!Array.isArray(rawSupply)) return undefined
  return rawSupply
    .map((entry): MajorSupplyStack | null => {
      if (!entry || typeof entry !== 'object') return null
      const raw = entry as { stackId?: unknown; familyId?: unknown; cardIds?: unknown; visibleId?: unknown }
      if (typeof raw.familyId !== 'string' || !Array.isArray(raw.cardIds)) return null
      const cardIds = raw.cardIds.filter(
        (id): id is string => typeof id === 'string' && !takenMajorIds.has(id),
      )
      const canonicalByStackId = typeof raw.stackId === 'string'
        ? canonicalMajorStackByStackId.get(raw.stackId)
        : undefined
      const canonical = canonicalByStackId ?? cardIds
        .map((id) => canonicalMajorStackByCard.get(id))
        .find((stack): stack is CanonicalMajorStack => !!stack) ??
        (typeof raw.visibleId === 'string' ? canonicalMajorStackByCard.get(raw.visibleId) : undefined)
      const stackId = typeof raw.stackId === 'string' ? raw.stackId : canonical?.stackId
      return recomputeVisible({ stackId, familyId: canonical?.familyId ?? raw.familyId, visibleId: null, cardIds })
    })
    .filter((stack): stack is MajorSupplyStack => !!stack)
}
