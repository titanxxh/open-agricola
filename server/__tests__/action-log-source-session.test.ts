import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { serializeSessionSnapshot, rehydrateState, type SerializedGameState } from '../../shared/session/serialization'
import { buildRoomHistoryPage } from '../../shared/session/history-window'
import { buildReplayActionLogPresentation } from '../../client/app/replay-action-log-presentation'
import { decodeReplayFrame, encodeReplayFrame, frameHash, type JsonValue } from '../game/replay-codec'

const CARD = 'B033_Mantlepiece'

// Generic logging integration, not a change to Mantlepiece's rule implementation.
// A fresh two-player work fixture plays a legal one-point improvement in round 13.
const setup = () => createWorkSession({
  configure: state => {
    state.round = 13
    const owner = state.players[0]!
    owner.houseType = 'clay'
    owner.resources.stone = 1
    owner.minorHand = [CARD]
  },
})

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  for (let step = 0; step < 2 && !response.state.players[0]!.minorPlayed.includes(CARD); step++) {
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error(`Expected improvement choice: ${JSON.stringify(response.interaction)}`)
    }
    const options = response.interaction.request.options
    const option = options.find(option => option.value === CARD)
      ?? options.find(option => option.value.startsWith('action-improvement-'))
    if (!option) throw new Error(`Missing improvement option: ${JSON.stringify(options)}`)
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.minorPlayed).toContain(CARD)
  expect(response.state.players[0]!.resources.stone).toBe(0)
  expect(response.state.players[0]!.cardStates[CARD]?.counters?.bonusVp).toBe(1)
  expect(response.scores?.[0]?.categories.find(category => category.key === 'cardBonusVp')?.entries
    .find(entry => entry.type === 'bonus' && entry.cardId === CARD)?.score).toBe(1)
  return response
}

const triggerRows = (state: Pick<GameState, 'events' | 'publicEventArchive' | 'log' | 'round' | 'players' | 'actionSpaces'>) =>
  buildReplayActionLogPresentation({
    events: state.events, publicEventArchive: state.publicEventArchive, stateLog: state.log,
    currentRound: state.round, locale: 'en', replayFilter: 'all',
    playerNames: Object.fromEntries(state.players.map(player => [player.id, player.name])),
    actionNames: Object.fromEntries(state.actionSpaces.map(space => [space.id, space.nameKey])),
  }).timelineBuckets.flatMap(bucket => bucket.rows)
    .filter(row => row.logEntry?.key === 'log.cardTriggered' && row.logEntry.params?.cardId === CARD)

const trigger = (session: GameSession) => {
  const event = session.state.events.find(event => event.type === 'card.triggered' && event.cardId === CARD)
  if (!event) throw new Error('Missing Mantlepiece trigger')
  return event
}

describe('new Action Log source associations at the authoritative boundary', () => {
  it('keeps undo and a repeated legal action distinct even when event numbers are reused', () => {
    const session = setup()
    try {
      const first = play(session)
      expect(first.interaction.stateId).toBe('wait')
      const oldTrigger = trigger(session)
      expect(triggerRows(first.state).map(row => row.kind)).toEqual(['event'])
      const undone = session.undoAction()
      expect(undone.ok, undone.error).toBe(true)
      expect(undone.state.players[0]!.minorHand).toContain(CARD)
      expect(undone.state.players[0]!.resources.stone).toBe(1)
      expect(undone.state.players[0]!.cardStates[CARD]?.counters?.bonusVp ?? 0).toBe(0)
      const second = play(session)
      const newTrigger = trigger(session)
      expect(newTrigger).toMatchObject({ id: oldTrigger.id, seq: oldTrigger.seq })
      expect(newTrigger.occurrenceId).toEqual(expect.any(String))
      expect(newTrigger.occurrenceId).not.toBe(oldTrigger.occurrenceId)
      expect(triggerRows(second.state).map(row => row.kind === 'event' ? row.status : row.kind))
        .toEqual(['active', 'canceled'])
    } finally { session.dispose() }
  })

  it('preserves association through JSON recovery, seat projections and a new Replay checkpoint/delta', () => {
    const session = setup()
    let restarted: GameSession | undefined
    try {
      const baseline: JsonValue = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session).frame))
      play(session)
      const occurrenceId = trigger(session).occurrenceId
      const saved = serializeSessionSnapshot(session.state, session)
      const serialized = JSON.parse(JSON.stringify(saved))
      restarted = new GameSession(rehydrateState(serialized))
      restarted.updatePlayerName(0, 'Renamed owner')
      expect(restarted.state.players[0]!.cardStates[CARD]?.counters?.bonusVp).toBe(1)
      expect(trigger(restarted).occurrenceId).toBe(occurrenceId)
      const raw = serializeSessionSnapshot(restarted.state, restarted).frame
      for (const viewer of ['p1', 'p2', null]) {
        const page = buildRoomHistoryPage(raw, viewer)
        const log = page.log.find(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === CARD)!
        expect(log.sourceEvent).toMatchObject({ occurrenceId, rowIndex: 0 })
        expect(triggerRows({ ...raw, ...page }).map(row => row.kind)).toEqual(['event'])
      }
      const frame: JsonValue = JSON.parse(JSON.stringify(raw))
      const checkpoint = encodeReplayFrame({ frame: baseline, previousFrame: null, stepNo: 0, previousCheckpointStepNo: 0 })
      const delta = encodeReplayFrame({ frame, previousFrame: baseline, stepNo: 1, previousCheckpointStepNo: 0 })
      expect(delta.payloadKind).toBe('delta')
      const restored = decodeReplayFrame(decodeReplayFrame(null, checkpoint), delta)
      expect(frameHash(restored)).toBe(frameHash(frame))
      const replayFrame: SerializedGameState = JSON.parse(JSON.stringify(restored))
      expect(triggerRows(replayFrame).map(row => row.kind)).toEqual(['event'])
      expect(replayFrame.log.find(entry => entry.key === 'log.cardTriggered')?.sourceEvent?.occurrenceId).toBe(occurrenceId)
    } finally { restarted?.dispose(); session.dispose() }
  })
})
