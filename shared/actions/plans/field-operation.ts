import { positionKey } from '../../domain/farm'
import type { ActionFlow, FarmTilePosition, Resource } from '../../contract/types'

export type FieldOperation =
  | { kind: 'replace'; from: 'grain' | 'vegetable'; fromAmount: number; to: 'grain' | 'vegetable'; toAmount: number }
  | { kind: 'remove-top'; amount: number; gain: Partial<Resource> }
  | { kind: 'discard-all' }
  | { kind: 'discard-crop-spaces' }
  | { kind: 'move'; amount: number }
  | { kind: 'move-destination'; amount: number; sourcePosition: string }

export const fieldOperationFlow = (sourceCard: string, operation: FieldOperation, tiles: FarmTilePosition[], maxSelections = 1, autoSingle = false): ActionFlow => ({
  type: 'leaf', actionId: 'field-operation', sourceCard,
  params: { operation, ...(autoSingle && tiles.length === 1 ? { position: positionKey(tiles[0]!) } : {}) },
  actionContext: { selectionKind: 'farm-position', selectableTiles: tiles, minSelections: 1, maxSelections },
})
