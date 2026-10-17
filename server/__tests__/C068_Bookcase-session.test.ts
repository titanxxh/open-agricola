import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C068_Bookcase'
import '../../shared/cards/B/B121_Geologist'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

const CARD_ID = 'C068_Bookcase'
const OCCUPATION_ID = 'B121_Geologist'

const setupPlay = (withOccupation = true) => {
  const session = new GameSession(68, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 14
  state.availableMajorImprovements = []
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationPlayed = withOccupation ? ['A116_WoodCutter'] : []
  player.resources = { ...player.resources, wood: 2, vegetable: 0 }
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
  return response
}

const setupTrigger = (activePlayerIndex: number) => {
  const session = new GameSession(680, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = activePlayerIndex
  state.round = 14
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.occupationHand = ['__test_placeholder__']
    player.resources.vegetable = 0
    player.resources.food = 2
  })
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players[activePlayerIndex]!.occupationHand = [OCCUPATION_ID]
  session.loadState(state)
  return session
}

describe('C068 Bookcase parity', () => {
  it('C068 S1: one occupation lets Bookcase cost two wood and stay in play', () => {
    const response = playMinor(setupPlay())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('C068 S2: playing a later occupation grants one vegetable', () => {
    const session = setupTrigger(0)
    const response = resolveTriggerIfPresent(session, session.takeAction(0, 'lessons'), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
  })

  it('C068 S3: another player playing an occupation grants the owner no vegetable', () => {
    const response = setupTrigger(1).takeAction(1, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.occupationPlayed).toContain(OCCUPATION_ID)
    expect(response.state.players.map((player) => player.resources.vegetable)).toEqual([0, 0])
  })

  it('C068 S4: no occupation keeps Bookcase unavailable', () => {
    const response = playMinor(setupPlay(false))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(2)
  })
})

describe('ae-negative-40-crops', () => {
  const { sessions, ok, options, save, setup, choose, finish, lesson, take, prerequisites, hand, buy, noSource, printed, denyMinor, completeRemaining } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C068 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'C068_Bookcase'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 2 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 0); assert.equal(r.state.players[0]!.resources.wood, 0); save("C068-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 1 }); }); denyMinor(t, card); save("C068-N1-short", t.getState()); const excluded = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "wood": 2 }); prerequisites(st, 0); }); denyMinor(excluded, card); save("C068-N1-prerequisite", excluded.getState()); });
  it('C068 N2 actual occupations award one vegetable after each fee and remain repeatable next round', () => { const card = 'C068_Bookcase', s = setup(card, 5, st => { st.players[0]!.occupationHand = ['A098_StableArchitect', 'A101_CookeryOutfitter']; }); let r = finish(s, lesson(s, 'A098_StableArchitect')); assert.equal(r.state.players[0]!.resources.vegetable, 1); assert.equal(r.state.players[0]!.resources.food, 39); save('C068-N2-first', r); r = finish(s, completeRemaining(s)); assert.equal(r.state.round, 6); r = finish(s, lesson(s, 'A101_CookeryOutfitter')); assert.equal(r.state.players[0]!.resources.vegetable, 2); assert.equal(r.state.players[0]!.resources.food, 38); save('C068-N2-second', r); });
  it('C068 N3 hand opponent unrelated and unavailable occupation fee cannot produce owner vegetables', () => { for (const mode of ['hand', 'opponent', 'unrelated', 'fee']) {
      const card = 'C068_Bookcase', s = setup(card, 14, st => { st.players[0]!.occupationHand = ['A098_StableArchitect']; if (mode === 'hand')
          hand(st, card); if (mode === 'opponent') {
          st.currentPlayerIndex = 1;
          st.players[0]!.occupationHand = ['__test_placeholder__'];
          st.players[1]!.occupationHand = ['A098_StableArchitect'];
      } if (mode === 'fee')
          st.players[0]!.resources.food = 0; });
      let r = s.getState();
      if (mode === 'fee')
          assertRejectedUnchanged(s, () => s.takeAction(0, 'lessons'));
      else if (mode === 'opponent') {
          r = ok(s.takeAction(1, 'lessons'));
          if (options(r).some(o => o.value === 'A098_StableArchitect'))
              r = choose(s, r, o => o.value === 'A098_StableArchitect');
          r = finish(s, r);
      }
      else
          r = mode === 'hand' ? finish(s, lesson(s, 'A098_StableArchitect')) : finish(s, take(s, 'forest'));
      assert.equal(r.state.players[0]!.resources.vegetable, 0);
      noSource(r, card);
      save(`C068-N3-${mode}`, r);
  } });
})
