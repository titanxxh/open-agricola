import { describe, expect, it, afterEach } from 'vitest'

import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { ActionDetailParts } from '../../shared/contract/protocol/game'
import { computeScores } from '../../shared/domain/scoring'

import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/B/B136_HouseSteward'
import assert from 'node:assert/strict'
import * as audit29Timing from './_helpers/audit/ae-negative-29-timing'

const CARD_ID = 'B136_HouseSteward'

const setupSession = (round: number) => {
  const session = new GameSession(undefined, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID, 'A085_Homekeeper']
  player.resources = { ...player.resources, food: 3, wood: 0 }

  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const resp = session.takeAction(0, 'lessons')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId === 'wait') {
    const option = resp.interaction.request.options?.find((entry) => entry.value === CARD_ID)
    expect(option).toBeDefined()
    return session.resolveChoice(0, option!.value)
  }
  return resp
}

describe('B136_HouseSteward session', () => {
  it.each([
    { round: 13, expectedWood: 1 },
    { round: 11, expectedWood: 2 },
    { round: 8, expectedWood: 3 },
    { round: 5, expectedWood: 4 },
  ])('gives $expectedWood wood when played in round $round', ({ round, expectedWood }) => {
    const session = setupSession(round)
    const resp = playOccupation(session)

    expect(resp.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(resp.state.players[0]!.resources.wood).toBe(expectedWood)
  })

  it('logs onBuy wood as a card effect instead of a Lessons action gain', () => {
    const session = setupSession(5)
    const resp = playOccupation(session)

    const cardEffectLog = resp.state.log.find(
      (entry) => entry.key === 'log.cardEffectGain' && entry.params?.cardId === CARD_ID,
    )
    expect(cardEffectLog?.params?.gain).toEqual({ wood: 4 })

    const lessonsActionDetail = resp.state.log.find(
      (entry) => entry.key === 'log.actionDetail' && entry.params?.action === 'actions.lessons.name',
    )
    const detailParts = lessonsActionDetail?.params?.detailParts as ActionDetailParts | undefined
    expect(detailParts?.gains?.wood ?? 0).toBe(0)
  })

  it('awards the shared room-majority bonus to all tied leaders, even without the card', () => {
    const session = setupSession(5)
    const resp = playOccupation(session)
    const state = resp.state

    state.players[0]!.rooms = 3
    state.players[1]!.rooms = 4
    state.players[2]!.rooms = 4

    const scores = session.withCtx(() => computeScores(state))
    const byPlayerId = new Map(scores.map((entry) => [entry.playerId, entry]))

    expect(
      byPlayerId.get(state.players[0]!.id)?.categories.find((c) => c.key === 'cardBonusVp')?.total ?? 0,
    ).toBe(0)
    expect(
      byPlayerId.get(state.players[1]!.id)?.categories.find((c) => c.key === 'cardBonusVp')?.total ?? 0,
    ).toBe(3)
    expect(
      byPlayerId.get(state.players[2]!.id)?.categories.find((c) => c.key === 'cardBonusVp')?.total ?? 0,
    ).toBe(3)
  })

  it('does not award the shared room-majority bonus when the card is not played', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players[0]!.rooms = 3
    state.players[1]!.rooms = 4
    state.players[2]!.rooms = 4

    const scores = session.withCtx(() => computeScores(state))

    expect(
      scores.some((entry) =>
        (entry.categories.find((c) => c.key === 'cardBonusVp')?.total ?? 0) > 0),
    ).toBe(false)
  })
})

describe('ae-negative-29-timing', () => {
  const { sessions, save, ok, make, lesson, bonus } = audit29Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('B136 N1 actual first occupation in five legal rounds uses complete rounds left and gives zero in round fourteen', () => { const results = []; for (const [round, wood] of [[5, 4], [8, 3], [11, 2], [13, 1], [14, 0]] as const) {
      const s = make('B136_HouseSteward', false, state => state.round = round), r = lesson(s, 'B136_HouseSteward');
      assert.equal(r.state.players[0]!.resources.wood, wood);
      assert.ok(r.state.players[0]!.occupationPlayed.includes('B136_HouseSteward'));
      results.push(r);
  } save('B136-N1', results); });
  it('B136 N2 shared scoring awards all opponents tied for most rooms excludes the owner and is absent while held', () => { const rows = []; for (const [played, owners] of [[true, [0]], [true, [1, 2]], [false, [1, 2]]] as const) {
      const s = make('B136_HouseSteward', played, state => { for (const i of owners) {
          state.players[i]!.roomTiles.push({ row: 1, col: 1 });
          state.players[i]!.rooms = 3;
      } }), r = ok(s.getState()), scores = [0, 1, 2].map(i => bonus(r, 'B136_HouseSteward', i));
      assert.deepEqual(scores, played ? owners.length === 1 ? [3, 0, 0] : [0, 3, 3] : [0, 0, 0]);
      rows.push(r);
  } save('B136-N2', rows); });
})
