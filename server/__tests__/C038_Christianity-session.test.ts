import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'

import '../../shared/cards/C/C038_Christianity'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Resources from './_helpers/audit/ae-negative-35-resources'

const CARD_ID = 'C038_Christianity'

const setup = (sheep: number) => {
  const session = new GameSession(38, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.resources.food = 0
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID]
  player.resources.sheep = sheep
  player.pastures = [{
    id: 'pasture',
    size: 1,
    tiles: [{ row: 0, col: 2 }],
    stables: 0,
    animalType: sheep === 0 ? null : 'sheep',
    animalCount: sheep,
  }]
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession) => {
  let response: SessionResponse = session.takeAction(0, 'major-improvement')
  for (let step = 0; step < 3 && response.state.players[0]!.minorHand.includes(CARD_ID); step++) {
    if (response.interaction.stateId !== 'wait') break
    const option = response.interaction.request.options?.find((candidate) =>
      candidate.value === CARD_ID || candidate.value.startsWith('action-improvement-'),
    )
    if (!option) break
    response = session.resolveChoice(0, option.value)
  }
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
    response = confirmPlayerSwitch(session)
  }
  return response
}

describe('C038 Christianity parity', () => {
  it('C038 S1: exactly one sheep lets Christianity give one food to every other player', () => {
    const response = playMinor(setup(1))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 1, 1])
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C038 S2: no sheep keeps Christianity unavailable', () => {
    const response = playMinor(setup(0))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 0, 0])
  })

  it('C038 S3: two sheep keep Christianity unavailable', () => {
    const response = playMinor(setup(2))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 0, 0])
  })
})

describe('ae-negative-35-resources', () => {
  const { sessions, save, ok, make, choose, finish, ready, action, buy, printed, animal, christian } = audit35Resources
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C038 N1 actual one housed sheep purchase gives exactly one food to every other player without spending the sheep and scores two printed points', () => {
      const rows = [];
      for (const players of [2, 3] as const) {
          const s = christian(1, players), r = finish(s, buy(s, 'C038_Christianity'));
          assert.deepEqual(r.state.players.map(p => p.resources.food), players === 2 ? [100, 101] : [100, 101, 101]);
          assert.equal(r.state.players[0]!.resources.sheep, 1);
          assert.equal(printed(r, 'C038_Christianity'), 2);
          rows.push(r);
      }
      save('C038-N1', rows);
  });
  it('C038 N2 zero and two sheep cannot satisfy exactly one sheep and do not give opponents food', () => {
      const rows = [];
      for (const n of [0, 2] as const) {
          const s = christian(n), p = buy(s, 'C038_Christianity'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'C038_Christianity'));
          assert.ok(p.state.players[0]!.minorHand.includes('C038_Christianity'));
          assert.equal(p.state.players[1]!.resources.food, 100);
          rows.push({ p, bad });
      }
      save('C038-N2', rows);
  });
  it('C038 N3 a held card cannot gift food during an ordinary action and only the actual purchaser is excluded from the gift', () => {
      const s = christian(), hand = action(s, 0, 'reed-bank');
      assert.equal(hand.state.players[1]!.resources.food, 100);
      const t = make('C038_Christianity', false, state => { animal(state, 'sheep', 1, 1); state.players[0]!.minorHand = ['__test_placeholder__']; state.players[1]!.minorHand = ['C038_Christianity']; });
      action(t, 0, 'forest');
      ready(t);
      const p = ok(t.takeAction(1, 'meeting-place'));
      let r = p;
      if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.request.options.some(o => o.value.startsWith('action-improvement-')))
          r = choose(t, r, o => o.value.startsWith('action-improvement-'));
      if (!r.state.players[1]!.minorPlayed.includes('C038_Christianity'))
          r = ok(t.resolveChoice(1, 'C038_Christianity'));
      r = finish(t, r);
      assert.deepEqual(r.state.players.map(p => p.resources.food), [101, 100]);
      save('C038-N3', { hand, p, r });
  });
})
