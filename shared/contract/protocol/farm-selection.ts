import type { FenceSelectionPayload, FenceSelectionQuote } from './game'

export const parseFenceSelectionQuote = (value: unknown): FenceSelectionQuote => {
  if (typeof value !== 'object' || value === null
    || !('requestKey' in value) || typeof value.requestKey !== 'string'
    || !('woodCost' in value) || typeof value.woodCost !== 'number' || !Number.isFinite(value.woodCost)
    || !('affordable' in value) || typeof value.affordable !== 'boolean'
    || !('valid' in value) || typeof value.valid !== 'boolean'
    || !('error' in value) || (value.error !== null && typeof value.error !== 'string')) {
    throw new Error('Invalid fence quote response')
  }
  return { requestKey: value.requestKey, woodCost: value.woodCost,
    affordable: value.affordable, valid: value.valid, error: value.error }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
export const isFenceEdges = (value: unknown): value is string[] => Array.isArray(value)
  && value.length <= 200 && value.every(edge => typeof edge === 'string' && edge.length <= 32)
export const isFenceSources = (value: unknown): value is Record<string, string> => isRecord(value)
  && Object.keys(value).length <= 200 && Object.values(value).every(source => typeof source === 'string')
const fenceSelectionKeys = new Set(['edges', 'palisadeEdges', 'fenceSources'])

export const parseFenceSelectionPayload = (value: unknown): FenceSelectionPayload => {
  if (!isRecord(value) || !isFenceEdges(value.edges)
    || Object.entries(value).some(([key, field]) => field !== undefined && !fenceSelectionKeys.has(key))
    || (value.palisadeEdges !== undefined && !isFenceEdges(value.palisadeEdges))
    || (value.fenceSources !== undefined && !isFenceSources(value.fenceSources))) {
    throw new Error('Invalid fence selection')
  }
  return { edges: value.edges, palisadeEdges: value.palisadeEdges,
    fenceSources: value.fenceSources }
}
