import type { PlayerState } from '../contract/types'

export const M084_BOG_PONY_ID = 'M084_BogPony'

const readPositiveInt = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0

export const readBogPonyLyingHorseCountFromExtraData = (value: unknown): number => {
  if (!value || typeof value !== 'object') return 0
  return readPositiveInt((value as { lyingHorseCount?: unknown }).lyingHorseCount)
}

export const getBogPonyLyingHorseCount = (player: PlayerState): number =>
  readBogPonyLyingHorseCountFromExtraData(
    player.cardStates?.[M084_BOG_PONY_ID]?.extraData,
  )
