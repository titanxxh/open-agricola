import type { FarmTilePosition, Resource, ResourceBatchExchangePayload } from '../types'
import { isFenceEdges, isFenceSources } from './farm-selection'

export type CommitSelectionPayload = {
  cancel?: boolean
  positions?: FarmTilePosition[]
  cardIds?: string[]
  resourceCounts?: Partial<Record<keyof Resource, number>>
  resourceBatchExchange?: ResourceBatchExchangePayload
  edges?: string[]
  palisadeEdges?: string[]
  fenceSources?: Record<string, string>
  rooms?: FarmTilePosition[]
  stables?: FarmTilePosition[]
  farmHand?: FarmTilePosition
  tile?: FarmTilePosition
  crops?: (FarmTilePosition & { crop: 'grain' | 'vegetable' | 'wood' | 'stone' })[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isPosition = (value: unknown): boolean =>
  isRecord(value) && typeof value.row === 'number' && typeof value.col === 'number'
const isPositions = (value: unknown): boolean => Array.isArray(value) && value.every(isPosition)
const isCrop = (value: unknown): boolean => isPosition(value)
  && ['grain', 'vegetable', 'wood', 'stone'].includes((value as { crop?: unknown }).crop as string)

const fieldValidators: Record<keyof CommitSelectionPayload, (value: unknown) => boolean> = {
  cancel: value => value === true,
  positions: isPositions,
  cardIds: value => Array.isArray(value) && value.every(id => typeof id === 'string'),
  resourceCounts: isRecord,
  resourceBatchExchange: isRecord,
  edges: isFenceEdges,
  palisadeEdges: isFenceEdges,
  fenceSources: isFenceSources,
  rooms: isPositions,
  stables: isPositions,
  farmHand: isPosition,
  tile: isPosition,
  crops: value => Array.isArray(value) && value.every(isCrop),
}

/** Every transport parses commitSelection here, so unknown or malformed fields fail the same way. */
export const parseCommitSelectionPayload = (value: unknown): CommitSelectionPayload => {
  if (!isRecord(value)) throw new Error('invalid payload')
  const entries = Object.entries(value).filter(([, field]) => field !== undefined)
  if (entries.length === 0 || entries.some(([key, field]) =>
    !Object.hasOwn(fieldValidators, key) || !fieldValidators[key as keyof CommitSelectionPayload](field))) {
    throw new Error('invalid payload')
  }
  return Object.fromEntries(entries) as CommitSelectionPayload
}
