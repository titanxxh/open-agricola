import type { FarmTilePosition } from '../../shared/contract/types'

export const buildStableCommitPayload = (
  pendingStableTiles: FarmTilePosition[],
  pendingFarmHand: FarmTilePosition | null,
): { stables: FarmTilePosition[]; farmHand: FarmTilePosition | undefined } | null => {
  if (pendingStableTiles.length === 0 && !pendingFarmHand) {
    return null
  }
  return { stables: pendingStableTiles, farmHand: pendingFarmHand ?? undefined }
}
