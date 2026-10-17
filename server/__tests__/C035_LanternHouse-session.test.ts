import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/C/C035_LanternHouse'
import '../../shared/cards/B/B146_Illusionist'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit34Scoring from './_helpers/audit/ae-negative-34-scoring'

const CARD_ID = 'C035_LanternHouse'

const FILLER = '__test_placeholder__'

const setup = ({
  played = false, occupations = 0, handCards = 1, round = 14, scoring = false,
}: {
  played?: boolean
  occupations?: number
  handCards?: number
  round?: number
  scoring?: boolean
} = {}) => {
  const session = new GameSession(6035, undefined, { playerCount: 3 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources,
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })

  const owner = state.players[0]!
  owner.minorPlayed = played ? [CARD_ID] : []
  owner.minorHand = played
    ? Array.from({ length: handCards }, () => FILLER)
    : [CARD_ID]
  owner.occupationHand = played && handCards > 0 ? [FILLER] : [FILLER]
  if (played && handCards > 0) {
    owner.minorHand = Array.from({ length: Math.max(0, handCards - 1) }, () => FILLER)
  }
  owner.occupationPlayed = Array.from({ length: occupations }, (_, index) =>
    ['A100_Curator', 'A125_Priest'][index]!)
  owner.resources.wood = played ? 0 : 1

  if (scoring) {
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 0)
    })
  }

  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  if (response.interaction.stateId !== 'wait') return response
  if (!options(response).some((option) => option.value === CARD_ID)) {
    const improvement = options(response).find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  }
  return response
}

const playMinor = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) =>
    option.value === CARD_ID || option.value === `minor:${CARD_ID}`)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const finishGame = (session: GameSession) => {
  let response = session.performRoundEnd()
  for (let guard = 0; guard < 40 && response.interaction.stateId === 'wait'; guard += 1) {
    const interaction = response.interaction
    if (interaction.request.kind === 'feed') {
      response = session.resolveChoice(interaction.playerIndex, 'confirm', { selections: [] })
      continue
    }
    const next = interaction.request.options?.find((option) => option.value === '__done__')
      ?? interaction.request.options?.find((option) => option.value === '__skip__')
      ?? interaction.request.options?.[0]
    if (!next) break
    response = session.resolveChoice(interaction.playerIndex, next.value)
  }
  return response
}

describe('C035 Lantern House parity', () => {
  it('C035 S1: no occupation and one wood allow Lantern House to be played', () => {
    const response = playMinor(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C035 S2: an occupation keeps Lantern House unavailable', () => {
    const response = enterMinor(setup({ occupations: 1 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(options(response).some((option) =>
      option.value === CARD_ID || option.value === `minor:${CARD_ID}`)).toBe(false)
  })

  it('C035 S3: three cards left in hand score seven printed points minus three', () => {
    const response = finishGame(setup({ played: true, handCards: 3, scoring: true }))
    const cards = response.scores[0]!.categories.find((category) => category.key === 'cards')
    const bonus = response.scores[0]!.categories.find((category) => category.key === 'cardBonusVp')

    expect(response.state.gameOver).toBe(true)
    expect(cards?.entries).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 7 }))
    expect(bonus?.entries).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: -3 }))
  })

  it('C035 S4: Lantern House prevents Illusionist from discarding a hand card at Forest', () => {
    const session = setup({ played: true, handCards: 1 })
    const state = session.getState().state
    const owner = state.players[0]!
    owner.occupationPlayed.push('B146_Illusionist')
    owner.minorHand = [FILLER]
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(3)
    expect(response.state.players[0]!.minorHand).toEqual([FILLER])
    expect(options(response).some((option) => option.sourceCard === 'B146_Illusionist')).toBe(false)
  })
})

describe('ae-negative-34-scoring', () => {
  const { sessions, actor, save, setup, choose, finish, next, lesson, take, move, prerequisites, hand, buy, noSource, accept, bonus, printed, finishGame, denyMinor, completeRemaining } = audit34Scoring
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C035 N1 real printed purchase pays exact cost and excludes insufficient resources or prerequisite', () => { const card = 'C035_LanternHouse', s = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); Object.assign(st.players[0]!.resources, { food: 40, wood: 1 }); }); const r = buy(s, card); assert.ok(r.state.players[0]!.minorPlayed.includes(card)); assert.equal(printed(r, card), 7); assert.equal(r.state.players[0]!.resources.wood, 0); save('C035-N1-legal', r); {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 0); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 0 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C035-N1-resource', q);
  } {
      const t = setup(card, 14, st => { hand(st, card); prerequisites(st, 1); st.players[0]!.houseType = 'wood'; Object.assign(st.players[0]!.resources, { food: 40, wood: 1 }); });
      const q = denyMinor(t, card);
      assert.equal(printed(q, card), 0);
      save('C035-N1-occupation', q);
  } });
  it('C035 N2 real final scoring subtracts exactly every remaining hand card from seven printed points', () => { for (const n of [2, 3, 5]) {
      const card = 'C035_LanternHouse', s = setup(card, 14, st => { st.players[0]!.minorHand = ['E050_WildGreens', 'B004_WoodPile', 'E032_Nave', 'E034_LandRegister'].slice(0, n - 1); st.players[0]!.occupationHand = ['A125_Priest']; });
      const r = finishGame(s);
      assert.equal(printed(r, card), 7);
      assert.equal(bonus(r, card), -n);
      assert.equal(r.state.players[0]!.minorHand.length + r.state.players[0]!.occupationHand.length, n);
      save(`C035-N2-${n}`, r);
  } });
  it('C035 N3 real Illusionist discard is accepted without Lantern and prevented after actual Lantern purchase', () => { const card = 'C035_LanternHouse', control = setup(card, 14, st => { hand(st, card); st.players[0]!.minorHand.push('E050_WildGreens'); st.players[0]!.occupationPlayed = ['B146_Illusionist']; }); let r = take(control, 'forest'); r = accept(control, r, 'B146_Illusionist'); r = choose(control, r, o => o.value === 'min:E050_WildGreens'); r = finish(control, r, true); assert.equal(r.state.players[0]!.resources.wood, 4); assert.ok(!r.state.players[0]!.minorHand.includes('E050_WildGreens')); save('C035-N3-legal-discard', r); const s = setup(card, 5, st => { hand(st, card); st.players[0]!.minorHand.push('E050_WildGreens'); st.players[0]!.occupationHand = ['B146_Illusionist']; st.players[0]!.resources.wood = 1; }); r = finish(s, buy(s, card)); move(s, 'grain-seeds'); move(s, 'day-laborer'); next(s); r = finish(s, lesson(s, 'B146_Illusionist')); r = finish(s, completeRemaining(s)); assert.equal(r.state.round, 6); r = take(s, 'forest'); noSource(r, 'B146_Illusionist'); assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), 'min:E050_WildGreens')); r = finish(s, r, true); assert.ok(r.state.players[0]!.minorHand.includes('E050_WildGreens')); assert.equal(r.state.players[0]!.resources.wood, 3); save('C035-N3-blocked', r); });
  it('C035 N4 actual play consumes the last minor and occupation so empty hand has no penalty', () => { const card = 'C035_LanternHouse', s = setup(card, 14, st => { hand(st, card); st.players[0]!.occupationHand = ['A125_Priest']; st.players[0]!.resources.wood = 1; }); finish(s, buy(s, card)); move(s, 'forest'); move(s, 'clay-pit'); next(s); let r = finish(s, lesson(s, 'A125_Priest')); assert.deepEqual(r.state.players[0]!.minorHand, []); assert.deepEqual(r.state.players[0]!.occupationHand, []); r = finish(s, completeRemaining(s), true); assert.ok(r.state.gameOver); assert.equal(printed(r, card), 7); assert.equal(bonus(r, card), 0); save('C035-N4', r); });
})
