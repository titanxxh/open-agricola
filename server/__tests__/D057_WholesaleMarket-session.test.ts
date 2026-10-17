import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D057_WholesaleMarket'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Timing from './_helpers/audit/ae-negative-38-timing'

const CARD_ID = 'D057_WholesaleMarket'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 2, vegetable = 2, round = 11 } = {}) => {
  const session = new GameSession(6057, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
    setWorkersAtHome(state, player, index === 0 ? 2 : 0)
  })
  const player = state.players[0]!
  player.minorHand = [CARD_ID, FILLER]
  player.resources.wood = wood
  player.resources.vegetable = vegetable
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession) => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession) => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const futureRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && (entry.resources.food ?? 0) > 0)
  .flatMap((entry) => Array.from({ length: entry.resources.food ?? 0 }, () => entry.round))
  .sort((left, right) => left - right)

describe('D057 Wholesale Market parity', () => {
  it('D057 S1: paying two wood and two vegetables schedules one food on every remaining round', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, vegetable: 0 })
    expect(futureRounds(response)).toEqual([12, 13, 14])
  })

  it('D057 S2: missing either printed resource keeps Wholesale Market unavailable', () => {
    for (const resources of [{ wood: 1, vegetable: 2 }, { wood: 2, vegetable: 1 }]) {
      const response = enterMinor(setup(resources))
      expect(offered(response)).toBe(false)
      expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
      expect(futureRounds(response)).toEqual([])
    }
  })

  it('D057 S3: a round-thirteen play schedules food only on round fourteen', () => {
    const response = play(setup({ round: 13 }))

    expect(futureRounds(response)).toEqual([14])
  })

  it('D057 S4: scheduled Wholesale Market food is received at the next round start', () => {
    const session = setup({ round: 12 })
    play(session)
    const state = session.getState().state
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
    })
    session.loadState(state)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(13)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(futureRounds(response)).toEqual([14])
  })
})

describe('ae-negative-38-timing', () => {
  const { sessions, save, pendingCard, finish, progress, buy, printed, NOFOOD, wholesale, future } = audit38Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D057 N1 actual two wood two vegetables purchase schedules every later round and natural next two rounds deliver food without an immediate gain', () => { const s = wholesale(), bought = finish(s, buy(s, 'D057_WholesaleMarket')); assert.deepEqual([bought.state.players[0]!.resources.wood, bought.state.players[0]!.resources.vegetable, bought.state.players[0]!.resources.food, printed(bought, 'D057_WholesaleMarket')], [0, 0, 100, 3]); assert.deepEqual(future(bought), [6, 7, 8, 9, 10, 11, 12, 13, 14].map(round => ({ round, food: 1 }))); const six = progress(s, 6, '', NOFOOD), seven = progress(s, 7, '', NOFOOD); assert.deepEqual([six.state.players[0]!.resources.food, seven.state.players[0]!.resources.food], [101, 102]); save('D057-N1', { bought, six, seven }); });
  it('D057 N2 late round twelve thirteen fourteen purchases truncate the queue after the current round', () => {
      const rows = [];
      for (const [round, rs] of [[12, [13, 14]], [13, [14]], [14, []]] as const) {
          const s = wholesale(round), r = finish(s, buy(s, 'D057_WholesaleMarket'));
          assert.deepEqual(future(r), rs.map(round => ({ round, food: 1 })));
          rows.push(r);
      }
      save('D057-N2', rows);
  });
  it('D057 N3 missing either cost cannot purchase or queue food and the held card never delivers at a real work boundary', () => {
      const rows = [];
      for (const [wood, veg] of [[1, 2], [2, 1]] as const) {
          const s = wholesale(5, wood, veg), p = buy(s, 'D057_WholesaleMarket'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D057_WholesaleMarket'));
          assert.deepEqual(future(p), []);
          rows.push({ p, bad });
      }
      const q = wholesale(), hand = progress(q, 6, 'D057_WholesaleMarket', NOFOOD);
      assert.equal(pendingCard(hand, 'D057_WholesaleMarket'), false);
      assert.equal(hand.state.players[0]!.resources.food, 100);
      save('D057-N3', { rows, hand });
  });
})
