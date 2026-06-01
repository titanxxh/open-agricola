import type { FarmTilePosition } from '../../shared/contract/types'

type BorrowedFenceSource = { kind: 'borrowed'; donorCaps: Record<string, number> }

export const buildFenceCommitPayload = (
  pendingFenceEdges: string[],
  pendingPalisadeEdges: string[],
  extraWood: number,
  fenceSource: BorrowedFenceSource | undefined,
  pendingFenceSources: Record<string, string>,
): {
  edges: string[]
  palisadeEdges: string[]
  extraWood: number
  fenceSources?: Record<string, string>
} => {
  if (fenceSource?.kind !== 'borrowed') {
    return {
      edges: pendingFenceEdges,
      palisadeEdges: pendingPalisadeEdges,
      extraWood,
    }
  }
  return {
    edges: pendingFenceEdges,
    palisadeEdges: pendingPalisadeEdges,
    extraWood,
    fenceSources: Object.fromEntries(
      pendingFenceEdges
        .filter((edgeId) => pendingFenceSources[edgeId])
        .map((edgeId) => [edgeId, pendingFenceSources[edgeId]]),
    ),
  }
}

export const buildStableCommitPayload = (
  pendingStableTiles: FarmTilePosition[],
  pendingFarmHand: FarmTilePosition | null,
): { stables: FarmTilePosition[]; farmHand: FarmTilePosition | undefined } | null => {
  if (pendingStableTiles.length === 0 && !pendingFarmHand) {
    return null
  }
  return { stables: pendingStableTiles, farmHand: pendingFarmHand ?? undefined }
}
