import type { GameState } from '../../contract/types'

const BASE_TO_VARIANTS: Record<string, string[]> = {
  hollow: ['hollow-4', 'hollow-56'],
  lessons: ['lessons-4', 'lessons-56-2f', 'lessons-56-variable'],
  grove: ['grove-56'],
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
