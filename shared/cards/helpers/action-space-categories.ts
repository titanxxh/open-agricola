export const HOLLOW_SPACE_IDS = ['hollow', 'hollow-4', 'hollow-56'] as const
export const WOOD_ACCUMULATION_SPACE_IDS = ['forest', 'copse', 'grove', 'copse-56', 'grove-56'] as const
export const TRAVELING_PLAYERS_SPACE_IDS = ['traveling-players', 'traveling-players-56'] as const

const HOLLOW_SPACE_ID_SET = new Set<string>(HOLLOW_SPACE_IDS)
const WOOD_ACCUMULATION_SPACE_ID_SET = new Set<string>(WOOD_ACCUMULATION_SPACE_IDS)
const TRAVELING_PLAYERS_SPACE_ID_SET = new Set<string>(TRAVELING_PLAYERS_SPACE_IDS)

export const isHollowSpaceId = (spaceId: string | null | undefined): boolean =>
  !!spaceId && HOLLOW_SPACE_ID_SET.has(spaceId)

export const isWoodAccumulationSpaceId = (spaceId: string | null | undefined): boolean =>
  !!spaceId && WOOD_ACCUMULATION_SPACE_ID_SET.has(spaceId)

export const isTravelingPlayersSpaceId = (spaceId: string | null | undefined): boolean =>
  !!spaceId && TRAVELING_PLAYERS_SPACE_ID_SET.has(spaceId)

export const findTravelingPlayersSpace = <T extends { id: string }>(
  spaces: readonly T[],
): T | undefined => spaces.find((space) => isTravelingPlayersSpaceId(space.id))
