// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import type { GameState } from '../../../shared/contract/types'
import type { Locale } from '../../../shared/i18n'
import { internalActionDefinitions } from '../../../shared/actions'
import { appendPublicEventCanceledPacket } from '../../../shared/events/archive'
import { createInitialState } from '../../../shared/session/state-bootstrap'
import { appendImmediateEvents } from '../../../shared/events/append'
import { eventsToLogEntries } from '../../../shared/events/log-mapper'
import { buildReplayActionLogPresentation } from '../replay-action-log-presentation'
import { ActionLog } from '../../components/board/ActionLog'

// Presentation regression only: this fixture does not execute B100's card rules.
const triggeredHistory = (actionId = 'bonus-vp', nameKey = 'actions.bonus-vp.name', count = 1) => {
  const state = createInitialState(42, {
    playerCount: 2, ordinaryCardDeckSeed: 42, parentSelectionSeed: 42,
  })
  state.events = []
  state.publicEventArchive = []
  state.nextEventSeq = 1
  state.nextPublicEventArchivePacketSeq = 1
  const events = appendImmediateEvents(state, Array.from({ length: count }, () => ({
    type: 'card.triggered' as const, cardId: 'B100_Clutterer', triggerActionId: actionId,
  })), { actorPlayerId: 'p1' })
  state.log = eventsToLogEntries(events, {
    playerNames: { p1: 'Alice' }, actionNames: { [actionId]: nameKey },
  })
  return state
}

const presentationFor = (state: GameState, locale: Locale = 'en') => buildReplayActionLogPresentation({
  events: state.events, publicEventArchive: state.publicEventArchive, stateLog: state.log,
  currentRound: state.round, locale, playerNames: { p1: 'Alice' },
  actionNames: Object.fromEntries(state.actionSpaces.map(space => [space.id, space.nameKey])),
  replayFilter: 'all',
})

describe('Action Log source association', () => {
  it.each([
    ['en', 'Gain Bonus VP'], ['zh', '获得加分'],
  ] as const)('renders one new bonus-vp occurrence once in %s with board-only client names', (locale, actionName) => {
    // JSON is the actual transport/archive boundary, not an in-memory association.
    const state = JSON.parse(JSON.stringify(triggeredHistory())) as ReturnType<typeof triggeredHistory>
    const presentation = presentationFor(state, locale)
    const { container } = render(<ActionLog locale={locale} log={state.log}
      currentRound={state.round} timelineBuckets={presentation.timelineBuckets} />)
    expect(container.querySelectorAll('li')).toHaveLength(1)
    expect(container).toHaveTextContent(actionName)
    expect(presentation.replaySummary).toMatchObject({ activeEvents: 1, canceledEvents: 0 })
  })

  // Audit real registered names, including aliases and generated bonus leaves.
  // This tests projection, not whether every internal leaf automatically emits a trigger.
  it.each(internalActionDefinitions.map(({ id, nameKey }) => [id, nameKey]))(
    'pairs the registered %s name with a board-only event projection', (actionId, nameKey) => {
      const state = triggeredHistory(actionId, nameKey)
      const before = JSON.stringify(state)
      const rows = presentationFor(state).timelineBuckets.flatMap(bucket => bucket.rows)
      expect(rows.map(row => row.kind)).toEqual(['event'])
      expect(JSON.stringify(state)).toBe(before)
    },
  )

  it.each(['en', 'zh'] as const)('preserves two identical real occurrences in %s', locale => {
    const state = triggeredHistory('bonus-vp', 'actions.bonus-vp.name', 2)
    const presentation = presentationFor(state, locale)
    const { container } = render(<ActionLog locale={locale} log={state.log}
      currentRound={state.round} timelineBuckets={presentation.timelineBuckets} />)
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(presentation.timelineBuckets.flatMap(bucket => bucket.rows).map(row => row.kind))
      .toEqual(['event', 'event'])
  })

  it('distinguishes a canceled occurrence from a new one with the same id, seq and text', () => {
    const state = triggeredHistory()
    const attempt = state.events[0]!
    appendPublicEventCanceledPacket(state, {
      reason: 'undoAction', previousMaxSeq: attempt.seq, nextMaxSeq: attempt.seq - 1,
      canceledEventIds: [attempt.id], canceledSeqs: [attempt.seq], canceledEvents: [attempt],
    })
    state.events = []
    state.log = []
    state.nextEventSeq = attempt.seq
    const [accepted] = appendImmediateEvents(state, [{
      type: 'card.triggered', cardId: 'B100_Clutterer', triggerActionId: 'bonus-vp',
    }], { actorPlayerId: 'p1' })
    state.log = eventsToLogEntries([accepted!], {
      playerNames: { p1: 'Alice' }, actionNames: { 'bonus-vp': 'actions.bonus-vp.name' },
    })
    expect(accepted).toMatchObject({ id: attempt.id, seq: attempt.seq })
    expect(accepted!.occurrenceId).not.toBe(attempt.occurrenceId)
    const presentation = presentationFor(state)
    const rows = presentation.timelineBuckets.flatMap(bucket => bucket.rows)
    expect(rows.map(row => row.kind === 'event' ? row.status : row.kind)).toEqual(['active', 'canceled'])
    const { container } = render(<ActionLog locale="en" log={state.log}
      currentRound={state.round} timelineBuckets={presentation.timelineBuckets} />)
    expect(container.querySelectorAll('li')).toHaveLength(2)
    expect(container.querySelectorAll('.action-log__text--canceled')).toHaveLength(1)
  })

  it('keeps an identified stateLog when its source event is absent', () => {
    const state = triggeredHistory()
    state.events = []
    state.publicEventArchive = []
    const rows = presentationFor(state).timelineBuckets.flatMap(bucket => bucket.rows)
    expect(rows).toMatchObject([{ kind: 'stateLog', logEntry: state.log[0] }])
  })

  it('does not consume a legacy log against a new event with identical presentation params', () => {
    const state = triggeredHistory('gain', 'actions.gain.name')
    const { sourceEvent: _source, ...legacy } = state.log[0]!
    state.log.push(legacy)
    const rows = presentationFor(state).timelineBuckets.flatMap(bucket => bucket.rows)
    expect(rows.map(row => row.kind)).toEqual(['event', 'stateLog'])
    expect(rows[1]!.logEntry).toEqual(legacy)
  })
})
