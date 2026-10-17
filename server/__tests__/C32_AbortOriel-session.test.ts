import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C032_AbortOriel'
import assert from 'node:assert/strict'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

const CARD_ID = 'C032_AbortOriel'

const setup = (actorCards: number, opponentCards: number) => {
  const session = new GameSession(32, undefined, { playerCount: 4 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const actor = state.players[0]!
  actor.minorHand = [CARD_ID]
  actor.minorPlayed = Array.from({ length: actorCards }, (_, index) => `actor-minor-${index}`)
  actor.resources.clay = 2
  state.players[1]!.occupationPlayed = Array.from(
    { length: opponentCards },
    (_, index) => `opponent-occupation-${index}`,
  )
  session.loadState(state)
  return session
}

const enterMinorSelection = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok).toBe(true)
  const improvement = response.interaction.stateId === 'wait'
    ? response.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
    : undefined
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

describe('C032_AbortOriel session', () => {
  it('C032 S1 actor can play Abort Oriel as their fifth front card', () => {
    const session = setup(4, 0)
    const scoreBefore = session.getState().scores[0]!.total
    const response = enterMinorSelection(session)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.minorHand).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.scores[0]!.total).toBe(scoreBefore + 3)
  })

  it('C032 S2 actor cannot play Abort Oriel after already having five front cards', () => {
    const session = setup(5, 0)
    const response = enterMinorSelection(session)

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('C032 S3 actor cannot play Abort Oriel when an opponent has five front cards', () => {
    const session = setup(0, 5)
    const response = enterMinorSelection(session)

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })
})

describe('ae-negative-34-scoring', () => {
  const { sessions, save, setup, finish, take, fillers, prerequisites, hand, buy, printed, denyMinor } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C032 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'C032_AbortOriel', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, clay: 2 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 3); assert.equal(r.state.players[0]!.resources.clay, 0); save('C032-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, clay: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C032-N1-resource', q);
  } });
  it('C032 N2 fifth card is allowed but any player with five played cards forbids purchase', () => { for (const [p, n, allowed] of [[0, 4, true], [0, 5, false], [1, 4, true], [1, 5, false]] as const) {
      const card = 'C032_AbortOriel', s = setup(card, 14, st => { hand(st, card); st.players[0]!.resources.clay = 2; st.players[p]!.occupationPlayed = [...fillers]; if (n === 5)
          st.players[p]!.minorPlayed.push('E050_WildGreens'); });
      const r = allowed ? buy(s, card) : denyMinor(s, card);
      assert.equal(printed(r, card), allowed ? 3 : 0);
      assert.equal(r.state.players[0]!.resources.clay, allowed ? 0 : 2);
      save(`C032-N2-${p}-${n}`, r);
  } });
  it('C032 N3 cards in hand do not count and unplayed card contributes no printed points', () => { const card = 'C032_AbortOriel', s = setup(card, 14, st => { hand(st, card); st.players[0]!.resources.clay = 2; st.players[1]!.minorHand = ['E050_WildGreens', 'B004_WoodPile', 'C033_GreeningPlan', 'E032_Nave', 'E034_LandRegister']; st.players[1]!.occupationHand = [...fillers]; }); const r = buy(s, card); assert.equal(printed(r, card), 3); assert.equal(r.state.players[1]!.minorHand.length, 5); save('C032-N3-hands', r); const t = setup(card, 14, st => hand(st, card)); const q = finish(t, take(t, 'grain-seeds'), true); assert.equal(printed(q, card), 0); save('C032-N3-unplayed', q); });
})
