import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/E/E085_MasterTanner'

const CARD_ID = 'E085_MasterTanner'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, resources = {}, cardFood = 0,
}: {
  played?: boolean
  resources?: Partial<Record<'food' | 'sheep' | 'boar' | 'cattle', number>>
  cardFood?: number
} = {}) => {
  const session = new GameSession(6085, undefined, { playerCount: 2 })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setActiveWorkerCount(player, 2)
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.improvements = ['Major_Fireplace1']
  owner.rooms = 2
  Object.assign(owner.resources, resources)
  if (cardFood > 0) {
    owner.cardStates[CARD_ID] = { stack: Array.from({ length: cardFood }, () => 'food') }
  }
  state.availableMajorImprovements = state.availableMajorImprovements.filter(
    (cardId) => cardId !== 'Major_Fireplace1',
  )
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const card = options(response).find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const cook = (session: GameSession, trades: string) => {
  const active = session.takeAction(0, 'farmland')
  expect(active.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
  let response = session.takeAnytimeAction(0, 'exchange')
  expect(response.ok, response.error).toBe(true)
  response = session.resolveChoice(0, trades)
  return resolveTriggerIfPresent(session, response, CARD_ID)
}

const cardFood = (response: SessionResponse) =>
  response.state.players[0]!.cardStates[CARD_ID]?.stack?.filter((item) => item === 'food').length ?? 0

const storeFood = (session: GameSession, response: SessionResponse, count: number) => {
  const option = options(response).find((entry) => count === 0
    ? entry.value === '__skip__' : entry.labelParams?.count === count)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(0, option!.value)
}

const familyCount = (response: SessionResponse) =>
  response.state.players[0]!.workers.filter((worker) => worker.isActive).length

describe('E085 Master Tanner parity', () => {
  it('E085 S1: Master Tanner is played as the first occupation', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('E085 S2: cooking one boar places one of its food onto Master Tanner', () => {
    const session = setup({ resources: { boar: 1 } })
    const response = storeFood(session, cook(session, 'bulk:1=1'), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, food: 1 })
    expect(cardFood(response)).toBe(1)
  })

  it('E085 S3: cooking one cattle places one of its food onto Master Tanner', () => {
    const session = setup({ resources: { cattle: 1 } })
    const response = storeFood(session, cook(session, 'bulk:2=1'), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ cattle: 0, food: 2 })
    expect(cardFood(response)).toBe(1)
  })

  it('E085 S4: cooking sheep offers no Master Tanner food placement', () => {
    const response = cook(setup({ resources: { sheep: 1 } }), 'bulk:0=1')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 2 })
    expect(cardFood(response)).toBe(0)
  })

  it.each([0, 1, 2])('chooses %i food from a boar and cattle batch without automatic storage', (count) => {
    const session = setup({ resources: { boar: 1, cattle: 1 } })
    const offered = cook(session, 'bulk:1=1,2=1')
    expect(offered.state.players[0]!.resources.food).toBe(5)
    expect(cardFood(offered)).toBe(0)
    const response = storeFood(session, offered, count)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 0, cattle: 0, food: 5 - count })
    expect(cardFood(response)).toBe(count)
  })

  it('limits storage to the converted animals even with food already in supply', () => {
    const session = setup({ resources: { boar: 1, food: 10 } })
    const offered = cook(session, 'bulk:1=1')
    expect(options(offered).filter((option) => option.value !== '__skip__')).toHaveLength(1)
    const response = storeFood(session, offered, 1)
    expect(response.state.players[0]!.resources.food).toBe(11)
    expect(cardFood(response)).toBe(1)
  })

  it('keeps stored food across separate exchanges', () => {
    const session = setup({ resources: { boar: 1, cattle: 1 } })
    let response = storeFood(session, cook(session, 'bulk:1=1'), 1)
    expect(cardFood(response)).toBe(1)
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(true)
    response = session.resolveChoice(0, 'bulk:2=1')
    response = resolveTriggerIfPresent(session, response, CARD_ID)
    response = storeFood(session, response, 1)
    expect(cardFood(response)).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(3)
  })

  it('E085 S6: food equal to room count gives one extra family-growth space', () => {
    const response = setup({ cardFood: 2 }).takeAction(0, 'wish-children')

    expect(response.ok, response.error).toBe(true)
    expect(familyCount(response)).toBe(3)
  })

  it('E085 S7: OA does not give the extra room when card food exceeds room count', () => {
    const response = setup({ cardFood: 3 }).takeAction(0, 'wish-children')

    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(familyCount(response)).toBe(2)
  })
})
