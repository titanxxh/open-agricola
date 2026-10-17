import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D047_Churchyard'
import assert from 'node:assert/strict'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

const CARD_ID = 'D047_Churchyard'
const FILLER = '__test_placeholder__'
const PLAYED_CARDS = [
  'A100_Curator', 'A106_SlurrySpreader', 'A167_BreederBuyer', 'A116_WoodCutter',
  'B121_Geologist', 'C123_Freemason', 'A095_Angler', 'A108_MushroomCollector',
  'A104_WoodHarvester', 'A160_Lutenist',
]

const setup = ({ playedCards = 10, reed = 1, stone = 1, round = 11 } = {}) => {
  const session = new GameSession(6047, undefined, { playerCount: 2 })
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
  player.occupationPlayed = PLAYED_CARDS.slice(0, playedCards)
  player.resources.reed = reed
  player.resources.stone = stone
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

describe('D047 Churchyard parity', () => {
  it('D047 S1: ten played cards and the printed cost play Churchyard and schedule two food on every remaining round', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 0, stone: 0 })
    expect(futureRounds(response)).toEqual([12, 12, 13, 13, 14, 14])
  })

  it('D047 S2: nine played cards keep Churchyard unavailable', () => {
    const response = enterMinor(setup({ playedCards: 9 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ reed: 1, stone: 1 })
    expect(futureRounds(response)).toEqual([])
  })

  it('D047 S3: missing either printed resource keeps Churchyard unavailable', () => {
    for (const resources of [{ reed: 0, stone: 1 }, { reed: 1, stone: 0 }]) {
      const response = enterMinor(setup(resources))
      expect(offered(response)).toBe(false)
      expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
      expect(futureRounds(response)).toEqual([])
    }
  })

  it('D047 S4: a round-thirteen play schedules exactly two food on round fourteen', () => {
    const response = play(setup({ round: 13 }))

    expect(futureRounds(response)).toEqual([14, 14])
  })

  it('D047 S5: both scheduled Churchyard food are received at the next round start', () => {
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
    expect(response.state.players[0]!.resources.food).toBe(22)
    expect(futureRounds(response)).toEqual([14, 14])
  })
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, end, final, purchase, rejectBuy, resource, future, points, front } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D047 N1 ten real eligible cards permit purchase and two foods are naturally received per remaining round", () => { const s = make('D047_Churchyard', st => { front(st, 10); Object.assign(st.players[0]!.resources, { stone: 1, reed: 1 }); }, false, 11), r = purchase(s, 'D047_Churchyard'); resource(r, { stone: 0, reed: 0, food: 100 }); assert.deepEqual(future(r, 'D047_Churchyard'), [12, 12, 13, 13, 14, 14]); const due = end(s); resource(due, { food: 98 }); assert.deepEqual(future(due, 'D047_Churchyard'), [13, 13, 14, 14]); save('D047-N1', { r, due }); });
  it("D047 N2 nine cards hand cards foreign cards or missing cost cannot satisfy Churchyard", () => { for (const mode of ['nine', 'handCard', 'foreign', 'stone', 'reed']) {
      const s = make('D047_Churchyard', st => { front(st, ['stone', 'reed'].includes(mode) ? 10 : 9); Object.assign(st.players[0]!.resources, { stone: mode === 'stone' ? 0 : 1, reed: mode === 'reed' ? 0 : 1 }); if (mode === 'handCard')
          st.players[0]!.minorHand.push('A010_WoodenShed'); if (mode === 'foreign')
          st.players[1]!.occupationPlayed = ['A101_CookeryOutfitter']; }, false, 11);
      save(`D047-N2-${mode}`, rejectBuy(s, 'D047_Churchyard'));
  } const s = make('D047_Churchyard', st => { front(st, 10); Object.assign(st.players[0]!.resources, { stone: 1, reed: 1 }); }, false, 11), r = end(s, true, [], 'D047_Churchyard'); resource(r, { food: 96 }); assert.deepEqual(future(r, 'D047_Churchyard'), []); save('D047-N2-held', r); });
  it("D047 N3 round thirteen and fourteen Churchyard builds truncate and score one printed point", () => { for (const round of [13, 14]) {
      const s = make('D047_Churchyard', st => { front(st, 10); Object.assign(st.players[0]!.resources, { stone: 1, reed: 1 }); }, false, round), r = purchase(s, 'D047_Churchyard');
      assert.deepEqual(future(r, 'D047_Churchyard'), round === 13 ? [14, 14] : []);
      const due = round === 13 ? end(s) : final(s);
      if (round === 13)
          resource(due, { food: 98 });
      else
          assert.equal(points(due, 'D047_Churchyard'), 1);
      save(`D047-N3-${round}`, { r, due });
  } });
})
