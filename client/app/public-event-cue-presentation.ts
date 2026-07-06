import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { GameEvent } from '../../shared/contract/events'
import type { GameSyncPayload } from '../../shared/contract/protocol/game'
import type { Resource } from '../../shared/contract/types'
import { resourceKeyList } from '../../shared/contract/state-constants'
import type { Locale } from '../../shared/i18n'
import type {
  PublicEventFenceEdgeHighlightTarget,
  PublicEventFarmTileHighlightTarget,
  PublicEventHighlightTargets,
  PublicEventNotification,
  PublicEventCardPassAnimation,
  PublicEventResourceAnimation,
} from './public-event-notifications'
import {
  collectNewPublicEventFeedback,
  collectPublicEventFeedback,
  emptyPublicEventHighlightTargets,
  maxPublicEventSeq,
} from './public-event-notifications'
import type { ReplayTimelineEntry } from './replay-timeline'

type PublicEventCancellationSnapshotPayload = {
  publicEventCancellations?: GameSyncPayload['publicEventCancellations']
  state: { events?: readonly { seq: number }[] }
}

type PublicEventCancellationSnapshotHandlers = {
  clearPublicEventFeedback: () => void
  setLastSeenPublicEventSeq: (seq: number) => void
}

export const applyPublicEventCancellationSnapshot = (
  payload: PublicEventCancellationSnapshotPayload,
  handlers: PublicEventCancellationSnapshotHandlers,
): boolean => {
  if (!payload.publicEventCancellations?.length) return false
  handlers.clearPublicEventFeedback()
  handlers.setLastSeenPublicEventSeq(maxPublicEventSeq(payload.state.events))
  return true
}

export type ReplayFeedback = {
  notifications: PublicEventNotification[]
  highlights: PublicEventHighlightTargets
  resourceAnimations: PublicEventResourceAnimation[]
  cardPassAnimations: PublicEventCardPassAnimation[]
}

export const clearReplayFeedback = (): ReplayFeedback => ({
  notifications: [],
  highlights: emptyPublicEventHighlightTargets(),
  resourceAnimations: [],
  cardPassAnimations: [],
})

export const buildReplayFeedback = (
  entry: ReplayTimelineEntry | null,
  locale: Locale,
): ReplayFeedback => {
  if (!entry?.event || !entry.replayable || entry.kind !== 'event') return clearReplayFeedback()
  return collectPublicEventFeedback([entry.event], locale, `replay:${entry.key}`)
}

export const hasPublicEventHighlights = (targets: PublicEventHighlightTargets): boolean =>
  targets.actionIds.length > 0 || targets.farmTiles.length > 0 || targets.fenceEdges.length > 0

export const mergePublicEventHighlights = (
  current: PublicEventHighlightTargets,
  incoming: PublicEventHighlightTargets,
): PublicEventHighlightTargets => ({
  actionIds: [...incoming.actionIds, ...current.actionIds],
  farmTiles: [...incoming.farmTiles, ...current.farmTiles],
  fenceEdges: [...incoming.fenceEdges, ...current.fenceEdges],
})

export const mergePublicEventResourceAnimations = (
  current: readonly PublicEventResourceAnimation[],
  incoming: readonly PublicEventResourceAnimation[],
): PublicEventResourceAnimation[] => [...incoming, ...current]

export const mergePublicEventCardPassAnimations = (
  current: readonly PublicEventCardPassAnimation[],
  incoming: readonly PublicEventCardPassAnimation[],
): PublicEventCardPassAnimation[] => [...incoming, ...current]

const removeCountedItems = <T>(
  current: readonly T[],
  removing: readonly T[],
  keyOf: (value: T) => string,
): T[] => {
  const remaining = new Map<string, number>()
  removing.forEach((value) => {
    const key = keyOf(value)
    remaining.set(key, (remaining.get(key) ?? 0) + 1)
  })
  return current.filter((value) => {
    const key = keyOf(value)
    const count = remaining.get(key) ?? 0
    if (count <= 0) return true
    remaining.set(key, count - 1)
    return false
  })
}

const farmTileHighlightKey = (target: PublicEventFarmTileHighlightTarget): string =>
  `${target.playerId}:${target.key}`

const fenceEdgeHighlightKey = (target: PublicEventFenceEdgeHighlightTarget): string =>
  `${target.playerId}:${target.edgeId}`

const resourceAnimationResourcesKey = (resources: Partial<Resource>): string =>
  resourceKeyList
    .map((key) => `${key}:${resources[key] ?? 0}`)
    .join('|')

const resourceAnimationKey = (animation: PublicEventResourceAnimation): string =>
  `${animation.id}:${animation.kind}:${JSON.stringify(animation.from)}:${JSON.stringify(animation.to)}:${resourceAnimationResourcesKey(animation.resources)}`

export const removePublicEventHighlights = (
  current: PublicEventHighlightTargets,
  removing: PublicEventHighlightTargets,
): PublicEventHighlightTargets => ({
  actionIds: removeCountedItems(current.actionIds, removing.actionIds, (value) => value),
  farmTiles: removeCountedItems(current.farmTiles, removing.farmTiles, farmTileHighlightKey),
  fenceEdges: removeCountedItems(current.fenceEdges, removing.fenceEdges, fenceEdgeHighlightKey),
})

export const removePublicEventResourceAnimations = (
  current: readonly PublicEventResourceAnimation[],
  removing: readonly PublicEventResourceAnimation[],
): PublicEventResourceAnimation[] =>
  removeCountedItems(current, removing, resourceAnimationKey)

export const removePublicEventCardPassAnimations = (
  current: readonly PublicEventCardPassAnimation[],
  removing: readonly PublicEventCardPassAnimation[],
): PublicEventCardPassAnimation[] =>
  removeCountedItems(current, removing, (animation) => animation.id)

export const filterPublicFarmHighlightsForPlayer = (
  targets: readonly PublicEventFarmTileHighlightTarget[],
  playerId: string,
): Set<string> =>
  new Set(targets.filter((target) => target.playerId === playerId).map((target) => target.key))

export const filterPublicFenceHighlightsForPlayer = (
  targets: readonly PublicEventFenceEdgeHighlightTarget[],
  playerId: string,
): Set<string> =>
  new Set(targets.filter((target) => target.playerId === playerId).map((target) => target.edgeId))

type PublicEventCueState = {
  events?: readonly GameEvent[]
} | null | undefined

type UsePublicEventCuePresentationArgs = {
  state: PublicEventCueState
  locale: Locale
  replayFeedback: ReplayFeedback
  displayPlayerId: string
}

export const usePublicEventCuePresentation = ({
  state,
  locale,
  replayFeedback,
  displayPlayerId,
}: UsePublicEventCuePresentationArgs) => {
  const publicEventNotificationBatchSeqRef = useRef(0)
  const publicEventNotificationTimersRef = useRef<number[]>([])
  const publicEventHighlightTimersRef = useRef<number[]>([])
  const publicEventResourceAnimationTimersRef = useRef<number[]>([])
  const publicEventCardPassAnimationTimersRef = useRef<number[]>([])
  const lastSeenPublicEventSeqRef = useRef<number | null>(null)
  const [publicEventNotifications, setPublicEventNotifications] = useState<PublicEventNotification[]>([])
  const [publicEventHighlights, setPublicEventHighlights] = useState<PublicEventHighlightTargets>(() => emptyPublicEventHighlightTargets())
  const [publicEventResourceAnimations, setPublicEventResourceAnimations] = useState<PublicEventResourceAnimation[]>([])
  const [publicEventCardPassAnimations, setPublicEventCardPassAnimations] = useState<PublicEventCardPassAnimation[]>([])

  const clearPublicEventFeedbackTimers = useCallback(() => {
    publicEventNotificationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventNotificationTimersRef.current = []
    publicEventHighlightTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventHighlightTimersRef.current = []
    publicEventResourceAnimationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventResourceAnimationTimersRef.current = []
    publicEventCardPassAnimationTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    publicEventCardPassAnimationTimersRef.current = []
  }, [])

  const clearPublicEventFeedback = useCallback(() => {
    clearPublicEventFeedbackTimers()
    setPublicEventNotifications([])
    setPublicEventHighlights(emptyPublicEventHighlightTargets())
    setPublicEventResourceAnimations([])
    setPublicEventCardPassAnimations([])
  }, [clearPublicEventFeedbackTimers])

  useEffect(() => () => {
    clearPublicEventFeedbackTimers()
  }, [clearPublicEventFeedbackTimers])

  useEffect(() => {
    if (!state) return
    const events = state.events ?? []
    publicEventNotificationBatchSeqRef.current += 1
    const batch = collectNewPublicEventFeedback(
      events,
      lastSeenPublicEventSeqRef.current,
      locale,
      `public-batch-${publicEventNotificationBatchSeqRef.current}`,
    )
    lastSeenPublicEventSeqRef.current = batch.nextCursor
    if (hasPublicEventHighlights(batch.highlights)) {
      setPublicEventHighlights((current) => mergePublicEventHighlights(current, batch.highlights))
      const timer = window.setTimeout(() => {
        setPublicEventHighlights((current) => removePublicEventHighlights(current, batch.highlights))
        publicEventHighlightTimersRef.current = publicEventHighlightTimersRef.current.filter((entry) => entry !== timer)
      }, 3200)
      publicEventHighlightTimersRef.current.push(timer)
    }
    if (batch.resourceAnimations.length > 0) {
      setPublicEventResourceAnimations((current) =>
        mergePublicEventResourceAnimations(current, batch.resourceAnimations).slice(0, 12),
      )
      const timer = window.setTimeout(() => {
        setPublicEventResourceAnimations((current) =>
          removePublicEventResourceAnimations(current, batch.resourceAnimations),
        )
        publicEventResourceAnimationTimersRef.current =
          publicEventResourceAnimationTimersRef.current.filter((entry) => entry !== timer)
      }, 1400)
      publicEventResourceAnimationTimersRef.current.push(timer)
    }
    if (batch.cardPassAnimations.length > 0) {
      setPublicEventCardPassAnimations((current) =>
        mergePublicEventCardPassAnimations(current, batch.cardPassAnimations).slice(0, 12),
      )
      const timer = window.setTimeout(() => {
        setPublicEventCardPassAnimations((current) =>
          removePublicEventCardPassAnimations(current, batch.cardPassAnimations),
        )
        publicEventCardPassAnimationTimersRef.current =
          publicEventCardPassAnimationTimersRef.current.filter((entry) => entry !== timer)
      }, 1400)
      publicEventCardPassAnimationTimersRef.current.push(timer)
    }
    if (batch.notifications.length > 0) {
      setPublicEventNotifications((current) => [...batch.notifications, ...current].slice(0, 4))
      batch.notifications.forEach((notification) => {
        const timer = window.setTimeout(() => {
          setPublicEventNotifications((current) =>
            current.filter((entry) => entry.id !== notification.id),
          )
          publicEventNotificationTimersRef.current = publicEventNotificationTimersRef.current.filter((entry) => entry !== timer)
        }, 4500)
        publicEventNotificationTimersRef.current.push(timer)
      })
    }
  }, [state, locale])

  const applySnapshotPublicEventCancellations = useCallback((payload: PublicEventCancellationSnapshotPayload): boolean =>
    applyPublicEventCancellationSnapshot(payload, {
      clearPublicEventFeedback,
      setLastSeenPublicEventSeq: (seq) => {
        lastSeenPublicEventSeqRef.current = seq
      },
    }), [clearPublicEventFeedback])

  const displayPublicEventNotifications = useMemo(
    () => [...replayFeedback.notifications, ...publicEventNotifications].slice(0, 4),
    [publicEventNotifications, replayFeedback.notifications],
  )
  const displayPublicEventHighlights = useMemo(
    () => mergePublicEventHighlights(publicEventHighlights, replayFeedback.highlights),
    [publicEventHighlights, replayFeedback.highlights],
  )
  const displayPublicEventResourceAnimations = useMemo(
    () => mergePublicEventResourceAnimations(
      publicEventResourceAnimations,
      replayFeedback.resourceAnimations,
    ).slice(0, 12),
    [publicEventResourceAnimations, replayFeedback.resourceAnimations],
  )
  const displayPublicEventCardPassAnimations = useMemo(
    () => mergePublicEventCardPassAnimations(
      publicEventCardPassAnimations,
      replayFeedback.cardPassAnimations,
    ).slice(0, 12),
    [publicEventCardPassAnimations, replayFeedback.cardPassAnimations],
  )
  const highlightedActionIds = useMemo(
    () => new Set(displayPublicEventHighlights.actionIds),
    [displayPublicEventHighlights.actionIds],
  )
  const highlightedFarmTileKeys = useMemo(
    () => filterPublicFarmHighlightsForPlayer(displayPublicEventHighlights.farmTiles, displayPlayerId),
    [displayPlayerId, displayPublicEventHighlights.farmTiles],
  )
  const highlightedFenceEdgeIds = useMemo(
    () => filterPublicFenceHighlightsForPlayer(displayPublicEventHighlights.fenceEdges, displayPlayerId),
    [displayPlayerId, displayPublicEventHighlights.fenceEdges],
  )

  return {
    applySnapshotPublicEventCancellations,
    displayPublicEventNotifications,
    displayPublicEventHighlights,
    displayPublicEventResourceAnimations,
    displayPublicEventCardPassAnimations,
    highlightedActionIds,
    highlightedFarmTileKeys,
    highlightedFenceEdgeIds,
  }
}
