import type { PlayerState } from '../../../contract/types'

export const setFencesForTest = (p: PlayerState, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    p.fenceSegments.push({
      edge: `__fence_${p.fenceSegments.length}`,
      type: 'fence',
      source: { kind: 'own', ownerPlayerId: p.id },
    })
  }
}

export const setPalisadesForTest = (p: PlayerState, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    p.fenceSegments.push({
      edge: `__palisade_${p.fenceSegments.length}`,
      type: 'palisade',
      source: { kind: 'own', ownerPlayerId: p.id },
    })
  }
}

export const setBorrowedFencesForTest = (
  p: PlayerState,
  donorPlayerId: string,
  edges: string[],
): void => {
  edges.forEach((edge) => {
    p.fenceSegments.push({
      edge,
      type: 'fence',
      source: { kind: 'borrowed', ownerPlayerId: donorPlayerId },
    })
  })
}
