import { GameSession } from '../game/authoritative-session'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import { describe, expect, it } from 'vitest'
import { D155_Ebonist as DisplayD155 } from '../../shared/cards/D/D155_Ebonist'
import { D155_Ebonist as RuntimeD155 } from '../../shared/cards/D/D155_Ebonist'
import { getExchangesInWindow } from '../../shared/actions/effects/exchange'
import type { PlayerState } from '../../shared/contract/types'

const CARD_ID = 'D155_Ebonist'

describe('D155_Ebonist exchange metadata', () => {
  it.each([DisplayD155, RuntimeD155])('exposes a harvest exchange on both definitions', (definition) => {
    expect(definition.id).toBe(CARD_ID)
    expect(definition.exchanges).toHaveLength(1)

    const xch = definition.exchanges![0]!
    expect(xch).toMatchObject({
      from: { wood: 1 },
      to: { food: 1, grain: 1 },
      max: 1,
      sourceId: CARD_ID,
      triggers: ['harvest'],
    })
  })

  it('is visible in the harvest window but not the anytime window', () => {
    const player = {
      occupationPlayed: [CARD_ID],
      minorPlayed: [],
      improvements: [],
    } as unknown as PlayerState

    expect(getExchangesInWindow(player, 'anytime').some((trade) => trade.sourceId === CARD_ID)).toBe(false)
    expect(getExchangesInWindow(player, 'harvest').some((trade) => trade.sourceId === CARD_ID)).toBe(true)
  })
})

describe('D155 Ebonist parity', () => {
  const CARD_ID = 'D155_Ebonist'

  const FILLER = '__test_placeholder__'

  const setup = ({
    played = true, wood = 1, food = 4, round = 4, harvest = false,
  }: {
    played?: boolean
    wood?: number
    food?: number
    round?: number
    harvest?: boolean
  } = {}) => {
    const session = new GameSession(6155, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = round
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0,
        food: index === 0 ? 0 : 20, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources = { ...owner.resources, wood, food }
    owner.startPlayer = true
    state.players.slice(1).forEach((player) => { player.startPlayer = false })
    if (harvest) {
      state.players.forEach((player) => {
        markAllWorkersUsed(state, player)
        setActiveWorkerCount(player, 2)
      })
    }
    session.loadState(state)
    return session
  }

  const ebonistTrade = [{
    sourceId: CARD_ID, exchangeIndex: 0, count: 1, sourceName: 'Ebonist',
  }]

  it('D155 S2: during harvest one wood becomes one food and one grain before feeding', () => {
    const session = setup({ food: 3, harvest: true })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed' },
    })

    response = session.resolveChoice(0, 'confirm', { selections: ebonistTrade })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, grain: 1, food: 0, begging: 0,
    })
  })

  it('D155 S3: the harvest exchange may be declined', () => {
    const session = setup({ harvest: true })
    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed' },
    })

    response = session.resolveChoice(0, 'confirm', { selections: [] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 1, grain: 0, food: 0, begging: 0,
    })
  })

  it('D155 S4: Ebonist is limited to one exchange in a harvest and allows a legal retry', () => {
    const session = setup({ wood: 2, food: 3, harvest: true })
    let response = session.performRoundEnd()
    const before = session.getState()

    response = session.resolveChoice(0, 'confirm', {
      selections: [{ ...ebonistTrade[0]!, count: 2 }],
    })
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before.state)
    expect(response.interaction).toEqual(before.interaction)

    response = session.resolveChoice(0, 'confirm', { selections: ebonistTrade })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 1, grain: 1, food: 0, begging: 0,
    })
  })
})
