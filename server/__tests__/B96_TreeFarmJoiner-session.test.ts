import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import '../../shared/cards/B/B096_TreeFarmJoiner'
import '../../shared/cards/B/B004_WoodPile'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'

const CARD_ID = 'B096_TreeFarmJoiner'
const MINOR_ID = 'B004_WoodPile'

describe('B96 Tree Farm Joiner session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 2
    state.players.forEach((player) => {
      markAllWorkersUsed(state, player)
      setActiveWorkerCount(player, 1)
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })

    const playerA = state.players[0]!
    const playerB = state.players[1]!
    playerA.startPlayer = true
    playerA.occupationPlayed.push(CARD_ID)
    playerA.minorHand = [MINOR_ID]
    setActiveWorkerCount(playerB, 0)
    state.futureMeeples = [{
      id: 'b96-future-wood',
      cardId: CARD_ID,
      playerId: playerA.id,
      round: 3,
      actionId: null,
      resources: { wood: 1 },
    }]

    session.loadState(state)
    return session
  }

  it('offers a card-local optional minor improvement after future wood receive', () => {
    const session = setup()

    const resp = session.performRoundEnd()

    expect(resp.state.players[0]!.resources.wood).toBe(1)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionOptionalAction')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined)
      .toBe(CARD_ID)
  })
})

describe('B096 Tree Farm Joiner parity', () => {
  const CARD_ID = 'B096_TreeFarmJoiner'

  const MINOR_ID = 'B004_WoodPile'

  const FILLER = '__test_placeholder__'

  const setup = ({ round, withMinor = false }: { round: number; withMinor?: boolean }) => {
    const session = new GameSession(6096 + round, undefined, { playerCount: 3 })
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
      player.cardStates = {}
      player.resources.food = 20
      player.resources.wood = 0
    })
    const owner = state.players[0]!
    owner.startPlayer = true
    owner.occupationHand = [CARD_ID]
    owner.minorHand = withMinor ? [MINOR_ID] : [FILLER]
    session.loadState(state)
    return session
  }

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const playOccupation = (session: GameSession) => {
    let response = session.takeAction(0, 'lessons')
    if (response.interaction.stateId === 'wait'
      && response.state.players[0]!.occupationHand.includes(CARD_ID)) {
      const card = options(response).find((option) => option.value === CARD_ID)
      expect(card, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, card!.value)
    }
    return response
  }

  const futureWoodRounds = (response: SessionResponse) => response.state.futureMeeples
    .filter((entry) => entry.cardId === CARD_ID && (entry.resources.wood ?? 0) > 0)
    .map((entry) => entry.round)
    .sort((left, right) => left - right)

  const reachFutureMinor = (session: GameSession) => {
    const state = session.getState().state
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    let response = session.performRoundEnd()
    for (let remaining = 20; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
      if (response.interaction.sourceCard === CARD_ID) return response
      if (response.interaction.request.kind === 'feed') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
        continue
      }
      if (response.interaction.request.kind === 'animal-reorg') {
        response = session.resolveChoice(response.interaction.playerIndex, 'confirm', [])
        continue
      }
      if (response.interaction.request.kind === 'confirm-next-player') {
        response = confirmNextPlayer(session)
        continue
      }
      if (response.interaction.request.kind === 'confirm-player-switch') {
        response = confirmPlayerSwitch(session)
        continue
      }
      if (response.interaction.request.options?.some((option) => option.value === '__skip__')) {
        response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
        continue
      }
      throw new Error(`unexpected round-end interaction ${JSON.stringify(response.interaction)}`)
    }
    return response
  }

  for (const { scenario, round, expected } of [
    { scenario: 'S1', round: 4, expected: [5, 7] },
    { scenario: 'S2', round: 5, expected: [7, 9] },
    { scenario: 'S3', round: 12, expected: [13] },
    { scenario: 'S4a', round: 13, expected: [] },
    { scenario: 'S4b', round: 14, expected: [] },
  ]) {
    it(`B096 ${scenario}: playing in round ${round} schedules wood on reachable next odd rounds`, () => {
      const response = playOccupation(setup({ round }))

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
      expect(futureWoodRounds(response)).toEqual(expected)
    })
  }

  it('B096 S5: receiving scheduled wood can immediately play a passing minor improvement', () => {
    const session = setup({ round: 4, withMinor: true })
    playOccupation(session)

    let response = reachFutureMinor(session)
    expect(response.state.round).toBe(5)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(futureWoodRounds(response)).toEqual([7])
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: CARD_ID })
    for (let remaining = 4; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
      const card = options(response).find((option) => option.value === MINOR_ID)
      if (card) {
        response = session.resolveChoice(response.interaction.playerIndex, card.value)
        break
      }
      const accept = options(response).find((option) => option.value !== '__skip__')
      expect(accept, JSON.stringify(response.interaction)).toBeDefined()
      response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).not.toContain(MINOR_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(MINOR_ID)
    expect(response.state.players[1]!.minorHand).toContain(MINOR_ID)
  })

  it('B096 S6: declining the immediate minor action keeps both the wood and the minor in hand', () => {
    const session = setup({ round: 4, withMinor: true })
    playOccupation(session)

    const offered = reachFutureMinor(session)
    expect(options(offered).some((option) => option.value === '__skip__')).toBe(true)
    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorHand).toContain(MINOR_ID)
    expect(response.state.players[1]!.minorHand).not.toContain(MINOR_ID)
  })
})
