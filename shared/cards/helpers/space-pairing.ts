import type { GameState } from '../../game/types'

const BASE_TO_VARIANTS: Record<string, string[]> = {
  hollow: ['hollow-4'],
  lessons: ['lessons-4'],
}

export const pairedSpaceIdFor = (
  state: GameState,
  baseId: string,
): string[] => {
  const variants = BASE_TO_VARIANTS[baseId] ?? []
  const presentVariants = variants.filter((v) =>
    (state.actionSpaces ?? []).some((s) => s.id === v),
  )
  return [baseId, ...presentVariants]
}
