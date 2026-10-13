export const getMoorWorkerPlacementPolicy = (spaceId: string): 'healthy-only' | 'sick-preferred' =>
  spaceId === 'moor-infirmary' ? 'sick-preferred' : 'healthy-only'
