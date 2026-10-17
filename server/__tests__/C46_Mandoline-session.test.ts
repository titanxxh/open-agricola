import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { isCardFlagged } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { GameState } from '../../shared/contract/types'

import '../../shared/cards/C/C046_Mandoline'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

const CARD_ID = 'C046_Mandoline'
const ANYTIME_ID = 'C46-mandoline-anytime'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, wood = 1, vegetable = 2, food = 20, round = 5,
} = {}) => {
  const session = createWorkSession({ seed: 5046, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.startPlayer = true
  state.players[1]!.startPlayer = false
  player.minorHand = played ? [FILLER] : [CARD_ID]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.wood = wood
  player.resources.vegetable = vegetable
  player.resources.food = food
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  const improvement = response.interaction.request.options?.find((candidate) =>
    candidate.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(response.interaction.playerIndex, improvement.value)
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((candidate) => candidate.value === CARD_ID) ?? false)

const enterActiveInteraction = (session: GameSession, playerIndex = 0) => {
  const response = session.takeAction(playerIndex, 'farmland')
  expect(response.ok, response.error).toBe(true)
  return response
}

const anytimeOffered = (response: SessionResponse) =>
  response.interaction.anytimeActions.some((action) => action.id === ANYTIME_ID)

const useMandoline = (session: GameSession) => {
  const active = enterActiveInteraction(session)
  expect(anytimeOffered(active)).toBe(true)
  const response = session.takeAnytimeAction(0, ANYTIME_ID)
  expect(response.ok, response.error).toBe(true)
  return response
}

const futureRounds = (state: GameState) => state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

const completeFarmland = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  let completed = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
  expect(completed.ok, completed.error).toBe(true)
  if (completed.interaction.stateId === 'wait'
    && completed.interaction.request.kind === 'confirm-next-player') {
    completed = session.resolveChoice(completed.interaction.request.nextPlayerIndex, 'confirm')
    expect(completed.ok, completed.error).toBe(true)
  }
  return completed
}

describe('C046 Mandoline parity', () => {
  it('C046 S1: paying one wood plays Mandoline', () => {
    const response = play(setup({ played: false, vegetable: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C046 S2: lacking wood keeps Mandoline unavailable', () => {
    const response = enterMinor(setup({ played: false, wood: 0, vegetable: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C046 S3: paying one vegetable grants one bonus point and schedules food for the next two rounds', () => {
    const response = useMandoline(setup())
    const player = response.state.players[0]!

    expect(player.resources.vegetable).toBe(1)
    expect(player.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(futureRounds(response.state)).toEqual([6, 7])
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
  })

  it('C046 S4: Mandoline cannot be used a second time in the same round', () => {
    const session = setup()
    const response = useMandoline(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(futureRounds(response.state)).toEqual([6, 7])
  })

  it('C046 S5: Mandoline is unavailable without a vegetable', () => {
    const session = setup({ vegetable: 0 })
    const response = enterActiveInteraction(session)

    expect(anytimeOffered(response)).toBe(false)
    expect(session.takeAnytimeAction(0, ANYTIME_ID).ok).toBe(false)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp ?? 0).toBe(0)
    expect(futureRounds(response.state)).toEqual([])
  })

  it('C046 S6: a round-thirteen use schedules only the reachable round-fourteen food', () => {
    const response = useMandoline(setup({ round: 13 }))

    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.counters?.bonusVp).toBe(1)
    expect(futureRounds(response.state)).toEqual([14])
  })

  it('C046 S7: next-round food is received and Mandoline becomes usable again', () => {
    const session = setup()
    const used = useMandoline(session)
    const foodBefore = used.state.players[0]!.resources.food
    completeFarmland(session, used)
    session.state.players.forEach((player) => markAllWorkersUsed(session.state, player))

    let nextRound = session.performRoundEnd()
    for (let step = 0; step < 3 && nextRound.interaction.stateId === 'wait'
      && nextRound.interaction.request.kind === 'select-trigger'; step += 1) {
      const source = nextRound.interaction.request.options.find(option => !option.disabled
        && option.labelKey !== 'actions.exchange.name' && option.value !== '__pass__')
      if (!source) throw new Error('Expected Mandoline reset or scheduled food')
      nextRound = session.resolveChoice(0, source.value)
      expect(nextRound.ok, nextRound.error).toBe(true)
    }

    expect(nextRound.ok, nextRound.error).toBe(true)
    expect(nextRound.state.round).toBe(6)
    expect(nextRound.state.players[0]!.resources.food).toBe(foodBefore + 1)
    expect(futureRounds(nextRound.state)).toEqual([7])
    expect(isCardFlagged(nextRound.state.players[0]!, CARD_ID)).toBe(false)
    expect(anytimeOffered(enterActiveInteraction(session))).toBe(true)
  })
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, finish, ready, fill, end, final, purchase, rejectBuy, resource, future, bonus, plow, anytime } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("C046 N1 real purchase and a paid anytime use grant one point and two naturally due foods", () => { const s = make('C046_Mandoline', st => Object.assign(st.players[0]!.resources, { wood: 1, vegetable: 2 }), false), bought = purchase(s, 'C046_Mandoline'); resource(bought, { wood: 0 }); fill(s); ready(s); const p = plow(s); assert.ok(p.interaction.anytimeActions.some(a => a.id === 'C46-mandoline-anytime')); const used = anytime(s, 'C46-mandoline-anytime'); resource(used, { vegetable: 1 }); assert.equal(bonus(used, 'C046_Mandoline'), 1); assert.deepEqual(future(used, 'C046_Mandoline'), [6, 7]); finish(s, used); const six = end(s), seven = end(s); resource(six, { food: 101 }); resource(seven, { food: 102 }); assert.deepEqual(future(seven, 'C046_Mandoline'), []); save('C046-N1', { bought, p, used, six, seven }); });
  it("C046 N2 same-round repeat absent vegetable held card foreign actor and missing wood prevent a payment", () => { save('C046-N2-cost', rejectBuy(make('C046_Mandoline', undefined, false), 'C046_Mandoline')); const s = make('C046_Mandoline', st => { st.players[0]!.resources.vegetable = 2; }), p = plow(s), used = anytime(s, 'C46-mandoline-anytime'), bad = assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, 'C46-mandoline-anytime')); resource(used, { vegetable: 1 }); assert.equal(bonus(used, 'C046_Mandoline'), 1); assert.deepEqual(future(used, 'C046_Mandoline'), [6, 7]); save('C046-N2-repeat', { p, used, bad, r: finish(s, used) }); for (const mode of ['vegetable', 'hand', 'opponent']) {
      const a = mode === 'opponent' ? 1 : 0, t = make('C046_Mandoline', st => { st.currentPlayerIndex = a; Object.assign(st.players[0]!.resources, { wood: 1, vegetable: mode === 'vegetable' ? 0 : 1 }); }, mode !== 'hand'), before = plow(t, a, 'C046_Mandoline');
      assert.equal(before.interaction.anytimeActions.some(x => x.id === 'C46-mandoline-anytime'), false);
      const rejected = assertRejectedUnchanged(t, () => t.takeAnytimeAction(a, 'C46-mandoline-anytime')), r = finish(t, before, true, [], 'C046_Mandoline');
      assert.deepEqual(future(r, 'C046_Mandoline'), []);
      assert.equal(bonus(r, 'C046_Mandoline'), 0);
      save(`C046-N2-${mode}`, { before, rejected, r });
  } });
  it("C046 N3 late-round paid uses award actual final points while future food stops at fourteen", () => { for (const round of [13, 14]) {
      const s = make('C046_Mandoline', st => { st.players[0]!.resources.vegetable = 1; }, true, round), p = plow(s), used = anytime(s, 'C46-mandoline-anytime');
      resource(used, { vegetable: 0 });
      assert.deepEqual(future(used, 'C046_Mandoline'), round === 13 ? [14] : []);
      finish(s, used);
      const due = round === 13 ? end(s) : s.getState();
      if (round === 13)
          resource(due, { food: 97 });
      const scored = final(s);
      assert.equal(bonus(scored, 'C046_Mandoline'), 1);
      save(`C046-N3-${round}`, { p, used, due, scored });
  } });
})
