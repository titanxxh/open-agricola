import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D054_TroutPool'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Timing from './_helpers/audit/ae-negative-38-timing'

const CARD_ID = 'D054_TroutPool'
const FILLER = '__test_placeholder__'

const setup = ({ played = false, clay = 2, fishingFood = 0, round = 2 } = {}) => {
  const session = new GameSession(6054, undefined, { playerCount: 2 })
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
  player.minorHand = played ? [FILLER] : [CARD_ID, FILLER]
  player.minorPlayed = played ? [CARD_ID] : []
  player.resources.clay = clay
  const fishing = state.actionSpaces.find((space) => space.id === 'fishing')
  if (!fishing) throw new Error('fishing missing')
  fishing.resources.food = fishingFood
  fishing.takenBy = []
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

const prepareRoundEnd = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  session.loadState(state)
}

const fishingFood = (response: SessionResponse) =>
  response.state.actionSpaces.find((space) => space.id === 'fishing')?.resources.food

describe('D054 Trout Pool parity', () => {
  it('D054 S1: paying two clay plays Trout Pool', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('D054 S2: without two clay Trout Pool is unavailable', () => {
    const response = enterMinor(setup({ clay: 1 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('D054 S3: Fishing accumulating to exactly three food grants one food at work phase start', () => {
    const session = setup({ played: true, fishingFood: 2 })
    prepareRoundEnd(session)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(21)
    expect(fishingFood(response)).toBe(3)
  })

  it('D054 S4: Fishing accumulating to only two food grants no Trout Pool food', () => {
    const session = setup({ played: true, fishingFood: 1 })
    prepareRoundEnd(session)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(20)
    expect(fishingFood(response)).toBe(2)
  })

  it('D054 S5: Trout Pool rechecks Fishing and can grant food again next round', () => {
    const session = setup({ played: true, fishingFood: 2 })
    prepareRoundEnd(session)
    session.performRoundEnd()
    prepareRoundEnd(session)

    const response = session.performRoundEnd()

    expect(response.state.round).toBe(4)
    expect(response.state.players[0]!.resources.food).toBe(22)
    expect(fishingFood(response)).toBe(4)
  })
})

describe('ae-negative-38-timing', () => {
  const { sessions, save, pendingCard, finish, progress, buy, action, printed, trout, NOFOOD } = audit38Timing
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D054 N1 actual two clay purchase has no immediate reward and legal work starts check the Fishing pile after accumulation at two three and four food', () => {
      const b = trout(false), bought = finish(b, buy(b, 'D054_TroutPool'));
      assert.deepEqual([bought.state.players[0]!.resources.clay, bought.state.players[0]!.resources.food, printed(bought, 'D054_TroutPool')], [0, 100, 1]);
      const rows = [];
      for (const [pile, food] of [[1, 100], [2, 101], [3, 101]] as const) {
          const s = trout(true, pile), r = progress(s, 6, '', NOFOOD);
          assert.equal(r.state.players[0]!.resources.food, food);
          assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, pile + 1);
          rows.push(r);
      }
      save('D054-N1', { bought, rows });
  });
  it('D054 N2 repeated qualifying work starts give one each and actual Fishing collects its untouched pile without another card reward', () => { const s = trout(), six = progress(s, 6, '', NOFOOD), seven = progress(s, 7, '', NOFOOD), r = action(s, 0, 'fishing'); assert.deepEqual([six.state.players[0]!.resources.food, seven.state.players[0]!.resources.food, r.state.players[0]!.resources.food], [101, 102, 106]); assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 0); save('D054-N2', { six, seven, r }); });
  it('D054 N3 a held card cannot give work start food and an actual one clay purchase attempt rejects', () => { const s = trout(false), hand = progress(s, 6, 'D054_TroutPool', NOFOOD); assert.equal(pendingCard(hand, 'D054_TroutPool'), false); assert.equal(hand.state.players[0]!.resources.food, 100); const t = trout(false, 2, 1), p = buy(t, 'D054_TroutPool'), bad = assertRejectedUnchanged(t, () => t.resolveChoice(0, 'D054_TroutPool')); save('D054-N3', { hand, p, bad }); });
})
