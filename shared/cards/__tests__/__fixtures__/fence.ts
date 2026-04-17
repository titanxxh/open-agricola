import type { FenceSegment, PlayerState } from '../../../game/types'

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

export const fenceSegment = (edge: string): FenceSegment => ({ edge, type: 'fence' })
export const palisadeSegment = (edge: string): FenceSegment => ({ edge, type: 'palisade' })
