export { M084_BOG_PONY_ID, readBogPonyLyingHorseCountFromExtraData, getBogPonyLyingHorseCount } from '../../projections/bog-pony-state'

export const writeBogPonyLyingHorseCount = (
  extraData: Record<string, unknown>,
  count: number,
): void => {
  const value = Math.max(0, Math.floor(count))
  if (value > 0) extraData.lyingHorseCount = value
  else delete extraData.lyingHorseCount
}
