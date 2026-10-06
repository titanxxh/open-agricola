import type { PlayerState } from '../../contract/types'
import type { PublicCardMarker } from '../../contract/card-state'
export type { PublicCardMarker } from '../../contract/card-state'
import { readCardExtraData, writeCardExtraData } from './card-state'

export const PUBLIC_CARD_MARKERS_KEY = 'publicCardMarkers'

export type PublicCardMarkerEntry = PublicCardMarker & {
  cardId: string
}

const isPublicCardMarker = (value: unknown): value is PublicCardMarker => {
  if (!value || typeof value !== 'object') return false
  const marker = value as Partial<PublicCardMarker>
  return typeof marker.id === 'string' &&
    typeof marker.label === 'string' &&
    typeof marker.sourceCardId === 'string' &&
    (marker.score === undefined || typeof marker.score === 'number') &&
    (marker.sourcePlayerId === undefined || typeof marker.sourcePlayerId === 'string')
}

export const readPublicCardMarkers = (
  player: PlayerState,
  cardId: string,
): PublicCardMarker[] => {
  const raw = readCardExtraData<unknown>(player, cardId, PUBLIC_CARD_MARKERS_KEY)
  if (!Array.isArray(raw)) return []
  return raw.filter(isPublicCardMarker)
}

export const writePublicCardMarkers = (
  player: PlayerState,
  cardId: string,
  markers: PublicCardMarker[],
): void => {
  writeCardExtraData(player, cardId, PUBLIC_CARD_MARKERS_KEY, markers)
}

export const addPublicCardMarker = (
  player: PlayerState,
  cardId: string,
  marker: PublicCardMarker,
): void => {
  const current = readPublicCardMarkers(player, cardId)
  if (current.some((entry) => entry.id === marker.id && entry.sourceCardId === marker.sourceCardId)) return
  writePublicCardMarkers(player, cardId, [...current, marker])
}

export const readAllPublicCardMarkers = (
  player: PlayerState,
): PublicCardMarkerEntry[] =>
  Object.keys(player.cardStates ?? {}).flatMap((cardId) =>
    readPublicCardMarkers(player, cardId).map((marker) => ({
      ...marker,
      cardId,
    })),
  )
