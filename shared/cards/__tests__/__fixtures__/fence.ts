import type { PlayerState } from '../../../contract/types'

export const setFencesForTest = (p: PlayerState, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    p.fenceSegments.push({ edge: `__fence_${p.fenceSegments.length}`, type: 'fence' })
  }
}

export const setPalisadesForTest = (p: PlayerState, n: number): void => {
  for (let i = 0; i < n; i += 1) {
    p.fenceSegments.push({ edge: `__palisade_${p.fenceSegments.length}`, type: 'palisade' })
  }
}
