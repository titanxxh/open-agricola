import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/E/E067_GrainBag'
import '../../shared/cards/E/E063_IronOven'
import '../../shared/cards/D/D059_EarthOven'
import assert from 'node:assert/strict'
import * as audit40Crops from './_helpers/audit/ae-negative-40-crops'

const CARD_ID = 'E067_GrainBag'

const FILLER = '__test_placeholder__'

const setup = ({ played = true, bakeCards = [] as string[] } = {}) => {
  const session = new GameSession(6067, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: index === 0 ? 0 : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [CARD_ID]
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.resources.reed = played ? 0 : 1
  for (const bakeCard of bakeCards) {
    if (bakeCard.startsWith('Major_')) owner.improvements.push(bakeCard)
    else owner.minorPlayed.push(bakeCard)
  }
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

describe('E067 Grain Bag parity', () => {
  it('E067 S1: paying one reed plays Grain Bag and it contributes one printed point', () => {
    const response = play(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.reed).toBe(0)
    expect(response.scores[0]!.categories.find((category) => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 1 }))
  })

  it('E067 S2: Grain Seeds gives only its base grain without a baking improvement', () => {
    const response = setup().takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
  })

  it('E067 S3: one baking improvement adds one grain at Grain Seeds', () => {
    const response = setup({ bakeCards: ['Major_Fireplace1'] }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('E067 S4: two different baking improvements add two grain at Grain Seeds', () => {
    const response = setup({
      bakeCards: ['Major_Fireplace1', 'E063_IronOven'],
    }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(3)
  })

  it('E067 S5: one dual-type baking improvement is counted only once', () => {
    const response = setup({ bakeCards: ['D059_EarthOven'] }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(2)
  })

  it('E067 S6: a non-Grain-Seeds action grants no extra grain', () => {
    const response = setup({ bakeCards: ['Major_Fireplace1'] }).takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  })
})

describe('ae-negative-40-crops', () => {
  const { sessions, ok, save, setup, finish, take, hand, buy, noSource, printed, ownMajor, denyMinor } = audit40Crops
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('E067 N1 actual hand purchase pays printed cost and meets each prerequisite', () => { const card = 'E067_GrainBag'; const s = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "reed": 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 1); assert.equal(r.state.players[0]!.resources.reed, 0); save("E067-N1-legal", r); const t = setup(card, 14, st => { hand(st, card); Object.assign(st.players[0]!.resources, { "reed": 0 }); }); denyMinor(t, card); save("E067-N1-short", t.getState()); });
  it('E067 N2 Grain Seeds counts zero one or two distinct baking improvements once each', () => { for (const n of [0, 1, 2]) {
      const card = 'E067_GrainBag', s = setup(card, 14, st => { for (const major of ['Major_Fireplace1', 'Major_CookingHearth1'].slice(0, n))
          ownMajor(st, major); });
      const r = finish(s, take(s, 'grain-seeds'));
      assert.equal(r.state.players[0]!.resources.grain, 1 + n);
      save(`E067-N2-${n}`, r);
  } });
  it('E067 N3 hand opponent unrelated and a nonbaking improvement cannot add owner grain', () => { for (const mode of ['hand', 'opponent', 'other', 'nonbake']) {
      const card = 'E067_GrainBag', s = setup(card, 14, st => { ownMajor(st, mode === 'nonbake' ? 'Major_Well' : 'Major_Fireplace1'); if (mode === 'hand')
          hand(st, card); if (mode === 'opponent')
          st.currentPlayerIndex = 1; });
      const r = finish(s, ok(s.takeAction(mode === 'opponent' ? 1 : 0, mode === 'other' ? 'forest' : 'grain-seeds')));
      assert.equal(r.state.players[0]!.resources.grain, ['opponent', 'other'].includes(mode) ? 0 : 1);
      noSource(r, card);
      save(`E067-N3-${mode}`, r);
  } });
})
