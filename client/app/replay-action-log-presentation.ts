import type { GameEvent, PublicEventArchivePacket } from '../../shared/contract/events'
import type { LogEntry } from '../../shared/contract/types'
import type { Locale } from '../../shared/i18n'
import { buildActionLogTimelineRows, type ActionLogTimelineBucket } from './action-log-timeline'
import { buildReplayFeedback, type ReplayFeedback } from './game-container-helpers'
import {
  buildReplayTimeline,
  filterReplayTimeline,
  summarizeReplayTimeline,
  type ReplayTimelineEntry,
  type ReplayTimelineFilter,
  type ReplayTimelineSummary,
} from './replay-timeline'

export type {
  ReplayTimelineEntry,
  ReplayTimelineFilter,
}

export type ReplayActionLogPresentationInput = {
  events: readonly GameEvent[]
  publicEventArchive: readonly PublicEventArchivePacket[]
  stateLog: readonly LogEntry[]
  currentRound: number
  locale: Locale
  playerNames: Record<string, string>
  actionNames?: Record<string, string>
  replayFilter: ReplayTimelineFilter
  selectedReplayKey?: string | null
}

export type ReplayActionLogPresentation = {
  timelineBuckets: ActionLogTimelineBucket[]
  replayTimeline: ReplayTimelineEntry[]
  replaySummary: ReplayTimelineSummary
  replayStepEntries: ReplayTimelineEntry[]
  selectedReplayEntry: ReplayTimelineEntry | null
  replayFeedback: ReplayFeedback
}

export const buildReplayActionLogPresentation = ({
  events,
  publicEventArchive,
  stateLog,
  currentRound,
  locale,
  playerNames,
  actionNames,
  replayFilter,
  selectedReplayKey,
}: ReplayActionLogPresentationInput): ReplayActionLogPresentation => {
  const replayTimeline = buildReplayTimeline({ events, publicEventArchive })
  const selectedReplayEntry = selectedReplayKey
    ? replayTimeline.find((entry) => entry.key === selectedReplayKey) ?? null
    : null

  return {
    replayTimeline,
    timelineBuckets: buildActionLogTimelineRows({
      entries: replayTimeline,
      stateLog,
      currentRound,
      locale,
      playerNames,
      actionNames,
    }),
    replaySummary: summarizeReplayTimeline(replayTimeline),
    replayStepEntries: filterReplayTimeline(replayTimeline, replayFilter)
      .filter((entry) => entry.replayable),
    selectedReplayEntry,
    replayFeedback: buildReplayFeedback(selectedReplayEntry, locale),
  }
}
