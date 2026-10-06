import type { CardPresentationDeclaration, CardStatePresentation } from '../../contract/card-state'
import type { CropStack, PlayerState } from '../../contract/types'
import { readCardResourceStats } from './card-state'
import { readPublicCardMarkers } from './public-card-markers'

const cropStack = (kind: unknown, remaining: unknown): CropStack | null =>
  (kind === 'grain' || kind === 'vegetable' || kind === 'wood' || kind === 'stone')
    && typeof remaining === 'number' && Number.isFinite(remaining) && remaining > 0
    ? { kind, remaining } : null

/** Common public text/statistics plus explicitly declared channels owned by this source. */
export const projectDeclaredCardState = (
  player: Readonly<PlayerState>,
  cardId: string,
  declaration: CardPresentationDeclaration = {},
): CardStatePresentation => {
  const state = player.cardStates?.[cardId]
  if (!state) return {}
  const data = state.extraData ?? {}
  const facts: CardStatePresentation = {}
  if (typeof state.infobox === 'string') facts.infobox = state.infobox
  const stats = readCardResourceStats(player, cardId)
  if (stats) facts.resourceStats = stats
  if (declaration.counters) {
    facts.counters = Object.fromEntries(declaration.counters.flatMap((key) => {
      const value = state.counters?.[key]
      return typeof value === 'number' && Number.isFinite(value) && value > 0 ? [[key, value]] : []
    }))
  }
  if (declaration.stack) facts.stack = state.stack ? [...state.stack] : []
  if (declaration.heldWorker && typeof data.heldWorkerId === 'string') facts.heldWorkerId = data.heldWorkerId
  if (declaration.reservedActionSpaces && Array.isArray(data.reservedActionSpaces)) {
    facts.reservedActionSpaces = data.reservedActionSpaces.filter((id): id is string => typeof id === 'string')
  }
  if (declaration.actionSpaceAttachments && Array.isArray(data.actionSpaceAttachments)) {
    facts.actionSpaceAttachments = structuredClone(data.actionSpaceAttachments) as CardStatePresentation['actionSpaceAttachments']
  }
  if (declaration.farmTerrainMarkers && Array.isArray(data.farmTerrainMarkers)) {
    facts.farmTerrainMarkers = structuredClone(data.farmTerrainMarkers) as CardStatePresentation['farmTerrainMarkers']
  }
  if (declaration.publicCardMarkers) facts.publicCardMarkers = structuredClone(readPublicCardMarkers(player, cardId))
  if (declaration.cardFields) {
    const layers: NonNullable<CardStatePresentation['cropLayers']> = []
    if (Array.isArray(data.cardFieldStacks)) {
      data.cardFieldStacks.forEach((entry, slotIndex) => {
        if (!entry || typeof entry !== 'object') return
        const slot = entry as { crop?: unknown; remaining?: unknown; below?: unknown[] }
        const values = [...(Array.isArray(slot.below) ? slot.below : []), slot]
        values.forEach((value, index) => {
          if (!value || typeof value !== 'object') return
          const layer = value as { crop?: unknown; remaining?: unknown }
          const stack = cropStack(layer.crop, layer.remaining)
          if (stack) layers.push({ stack, slotIndex, top: index === values.length - 1 })
        })
      })
    } else if (Array.isArray(data.stacks)) {
      for (const entry of data.stacks) {
        if (!entry || typeof entry !== 'object') continue
        const value = entry as { kind?: unknown; remaining?: unknown }
        const stack = cropStack(value.kind, value.remaining)
        if (stack) layers.push({ stack })
      }
    } else if (data.cardCrop && typeof data.cardCrop === 'object') {
      const value = data.cardCrop as { crop?: unknown; remaining?: unknown }
      const stack = cropStack(value.crop, value.remaining)
      if (stack) layers.push({ stack })
    }
    facts.cropLayers = layers
  }
  return facts
}
