import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/D/D048_CivicFacade'
import assert from 'node:assert/strict'
import * as audit36Native from './_helpers/audit/ae-negative-36-native'

const CARD_ID = 'D048_CivicFacade'
const FILLER = '__test_placeholder__'

const setup = ({ rooms = 3, clay = 1, round = 1 } = {}) => {
  const session = new GameSession(6048, undefined, { playerCount: 2 })
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
  player.resources.clay = clay
  player.rooms = rooms
  player.roomTiles = Array.from({ length: rooms }, (_, index) => ({ row: 0, col: index }))
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

const prepareRoundEnd = (session: GameSession, occupations: number, improvements: number) => {
  const state = session.getState().state
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  })
  state.players[0]!.occupationHand = Array.from(
    { length: occupations }, (_, index) => `__occupation_${index}__`,
  )
  state.players[0]!.minorHand = Array.from(
    { length: improvements }, (_, index) => `__improvement_${index}__`,
  )
  session.loadState(state)
}

describe('D048 Civic Facade parity', () => {
  it('D048 S1: three rooms and one clay play Civic Facade', () => {
    const response = play(setup())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  })

  it('D048 S2: two rooms keep Civic Facade unavailable without spending clay', () => {
    const response = enterMinor(setup({ rooms: 2 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.clay).toBe(1)
  })

  it('D048 S3: without clay an otherwise legal Civic Facade is unavailable', () => {
    const response = enterMinor(setup({ clay: 0 }))

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('D048 S4: more occupations than improvements in hand gain one food at each round start', () => {
    const session = setup()
    play(session)
    prepareRoundEnd(session, 2, 1)

    let response = session.performRoundEnd()
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(21)

    prepareRoundEnd(session, 2, 1)
    response = session.performRoundEnd()
    expect(response.state.round).toBe(3)
    expect(response.state.players[0]!.resources.food).toBe(22)
  })

  it.each([['S5', 1, 1], ['S6', 1, 2]] as const)(
    'D048 %s: %i occupation and %i improvement cards in hand grant no food',
    (_scenario, occupations, improvements) => {
      const session = setup()
      play(session)
      prepareRoundEnd(session, occupations, improvements)

      const response = session.performRoundEnd()

      expect(response.state.round).toBe(2)
      expect(response.state.players[0]!.resources.food).toBe(20)
    },
  )
})

describe('ae-negative-36-native', () => {
  const { sessions, traces, save, make, take, finish, end, purchase, rejectBuy, resource, house } = audit36Native
  afterEach(() => { sessions.splice(0).forEach(s => s.dispose()); traces.splice(0); });
  it("D048 N1 real three-room purchase and actual Lessons change the strict hand comparison across natural starts", () => { const s = make('D048_CivicFacade', st => { house(st.players[0]!, 3); st.players[0]!.occupationHand = ['A125_Priest', 'A103_Portmonger', 'A110_Roughcaster']; st.players[0]!.resources.clay = 1; }, false), r = purchase(s, 'D048_CivicFacade'); resource(r, { clay: 0, food: 100 }); const six = end(s); resource(six, { food: 101 }); const lessons = finish(s, take(s, 0, 'lessons'), true, ['A125_Priest']); resource(lessons, { food: 101 }); assert.equal(lessons.state.players[0]!.occupationHand.length, 2); assert.equal(lessons.state.players[0]!.minorHand.length, 2); const seven = end(s, true, [], 'D048_CivicFacade'); resource(seven, { food: 101 }); save('D048-N1', { r, six, lessons, seven }); });
  it("D048 N2 two rooms clay shortage ties fewer occupations and hand-only card cannot earn the round-start food", () => { for (const mode of ['room', 'clay'])
      save(`D048-N2-buy-${mode}`, rejectBuy(make('D048_CivicFacade', st => { house(st.players[0]!, mode === 'room' ? 2 : 3); st.players[0]!.resources.clay = mode === 'clay' ? 0 : 1; }, false), 'D048_CivicFacade')); for (const mode of ['tie', 'fewer', 'hand']) {
      const s = make('D048_CivicFacade', st => { house(st.players[0]!, 3); st.players[0]!.resources.clay = 1; st.players[0]!.occupationHand = mode === 'hand' ? ['A125_Priest', 'A103_Portmonger', 'A110_Roughcaster', 'A100_Curator'] : mode === 'fewer' ? ['A125_Priest'] : ['A125_Priest', 'A103_Portmonger']; }, mode !== 'hand'), r = end(s, true, [], 'D048_CivicFacade');
      resource(r, { food: 100 });
      save(`D048-N2-${mode}`, r);
  } });
  it("D048 N3 foreign ownership pays the actual owner only and ordinary work cannot pay early", () => { const s = make('D048_CivicFacade', st => { st.players[0]!.minorPlayed = []; st.players[1]!.minorPlayed = ['D048_CivicFacade']; house(st.players[1]!, 3); st.players[1]!.occupationHand = ['A116_WoodCutter', 'A123_FrameBuilder', 'A101_CookeryOutfitter']; st.players[1]!.minorHand=['A010_WoodenShed']; }), r = end(s); resource(r, { food: 100 }); resource(r, { food: 101 }, 1); save('D048-N3-foreign', r); const t = make('D048_CivicFacade', st => { st.players[0]!.occupationHand = ['A125_Priest', 'A103_Portmonger', 'A110_Roughcaster']; }), mid = finish(t, take(t, 0, 'clay-pit'), true, [], 'D048_CivicFacade'); resource(mid, { food: 100 }); save('D048-N3-midround', mid); });
})
