import type { FarmTilePosition } from '../../../shared/contract/types'

export const farmHandCenterPostKey = (topLeft: FarmTilePosition): string =>
  `${topLeft.row * 2 + 2}-${topLeft.col * 2 + 2}`

export const farmHandTopLeftFromCenterKey = (
  postKey: string,
): FarmTilePosition | null => {
  const [postRow, postCol] = postKey.split('-').map(Number)
  if (Number.isNaN(postRow) || Number.isNaN(postCol)) return null
  if (postRow < 2 || postCol < 2 || postRow % 2 !== 0 || postCol % 2 !== 0) {
    return null
  }
  return { row: (postRow - 2) / 2, col: (postCol - 2) / 2 }
}
