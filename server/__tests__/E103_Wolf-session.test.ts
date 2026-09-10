import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E103_Wolf'
import '../../shared/cards/B/B040_BreweryPond'
import '../../shared/cards/C/C102_TreeGuard'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'E103_Wolf'
const BREWERY_POND = 'B040_BreweryPond'
const FILLER = '__test_placeholder__'
const FULL_STACK = ['clay', 'wood', 'grain']

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const setup = ({
  played = true, stack = FULL_STACK, actor = 0, breweryPond = false,
}: {
  played?: boolean
  stack?: string[]
  actor?: number
  breweryPond?: boolean
} = {}) => {
  const session = new GameSession(6103, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = actor
  state.round = 5
  state.roundPhase = 'work'
  state.actionSpaces.forEach((space) => {
    space.takenBy = []
    if (space.id === 'grain-seeds') space.resources.grain = 0
    if (space.id === 'forest') space.resources.wood = 1
    if (space.id === 'fishing') space.resources.food = 2
  })
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    if (index !== actor) setWorkersAtHome(state, player, 0)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  if (played) owner.cardStates[CARD_ID] = { stack: [...stack] }
  if (breweryPond) owner.minorPlayed.push(BREWERY_POND)
  owner.pastures = [{
    id: 'wolf-pasture', size: 2, tiles: [{ row: 2, col: 3 }, { row: 2, col: 4 }],
    stables: 0, animalType: null, animalCount: 0,
  }]
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (response.state.players[0]!.occupationPlayed.includes(CARD_ID)) return response
  const card = options(response).find((option) => option.value === CARD_ID)
  expect(card, JSON.stringify(response.interaction)).toBeDefined()
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const resolveWolf = (session: GameSession, initial: SessionResponse, count: number) => {
  const offered = resolveTriggerIfPresent(session, initial, CARD_ID)
  const option = options(offered).find((entry) => count === 0
    ? entry.value === '__skip__'
    : entry.labelParams?.count === count || entry.effectPreview?.resourcesGained?.boar === count)
  expect(option, JSON.stringify(offered.interaction)).toBeDefined()
  let response = session.resolveChoice(offered.interaction.playerIndex, option!.value)
  if (count > 0) {
    expect(response.interaction.request.kind).toBe('animal-reorg')
    response = session.resolveChoice(0, 'confirm', { zones: [{
      id: 'wolf-pasture', zoneType: 'pasture', animalType: 'boar',
      animalCount: response.state.players[0]!.resources.boar,
    }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(count)
  }
  return response
}

describe('E103 Wolf parity', () => {
  it('receiving grain during the harvest can claim the stack grain and place the boar', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 4
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    state.players[0]!.fields = [{ row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] }]
    session.loadState(state)
    const response = resolveWolf(session, session.performRoundEnd(), 1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, boar: 1 })
    expect(response.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(2)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay', 'wood'])
  })
  it('E103 S1: playing Wolf piles clay, wood, and grain from bottom to top', () => {
    const response = playOccupation(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(FULL_STACK)
  })

  it('E103 S2: accepting after gaining the top grain pops it and gains one boar', () => {
    const session = setup()
    const response = resolveWolf(session, session.takeAction(0, 'grain-seeds'), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, boar: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay', 'wood'])
  })

  it('E103 S3: declining after gaining grain keeps the entire stack', () => {
    const session = setup()
    const response = resolveWolf(session, session.takeAction(0, 'grain-seeds'), 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, boar: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(FULL_STACK)
  })

  it('E103 S4: gaining a nonmatching resource does not trigger Wolf', () => {
    const response = setup().takeAction(0, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, boar: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(FULL_STACK)
  })

  it('E103 S5: accepting after collecting matching wood pops it and gains one boar', () => {
    const session = setup({ stack: ['clay', 'wood'] })
    const response = resolveWolf(session, session.takeAction(0, 'forest'), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, boar: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay'])
  })

  it('E103 S6: an empty Wolf stack no longer triggers on matching gains', () => {
    const response = setup({ stack: [] }).takeAction(0, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, boar: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual([])
  })

  it('E103 S7: one gain containing grain and wood can claim both matching items', () => {
    const session = setup({ breweryPond: true })
    const response = resolveWolf(session, session.takeAction(0, 'fishing'), 2)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 2, grain: 2, wood: 2, boar: 2,
    })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay'])
  })

  it('E103 S8: another player gaining the top resource does not trigger the owners Wolf', () => {
    const response = setup({ actor: 1 }).takeAction(1, 'grain-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 0, boar: 0 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(FULL_STACK)
    expect(response.state.players[1]!.resources.grain).toBe(1)
  })
  it('can stop after only the first matching item in a multi-resource gain', () => {
    const session = setup({ breweryPond: true })
    const response = resolveWolf(session, session.takeAction(0, 'fishing'), 1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, wood: 1, boar: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay', 'wood'])
  })

  it('does not claim clay beyond the unmatched wood after Tree Guard gives grain and clay', () => {
    const session = setup()
    session.state.players[0]!.occupationPlayed.push('C102_TreeGuard')
    session.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 4
    let response = session.takeAction(0, 'forest')
    response = resolveTriggerIfPresent(session, response, 'C102_TreeGuard')
    const accept = options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    response = session.resolveChoice(0, accept!.value)
    expect(options(response).filter((option) => option.value !== '__skip__')).toHaveLength(1)
    response = resolveWolf(session, response, 1)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 2, clay: 1, boar: 1 })
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay', 'wood'])
  })

  it('declines one gain once and may accept a later matching gain', () => {
    const session = setup({ breweryPond: true })
    let response = resolveWolf(session, session.takeAction(0, 'grain-seeds'), 0)
    expect(response.interaction.request.kind).toBe('confirm-next-player')
    expect(session.resolveChoice(0, 'confirm').ok).toBe(true)
    response = resolveWolf(session, session.takeAction(0, 'fishing'), 1)
    expect(response.state.players[0]!.resources.grain).toBe(3)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.stack).toEqual(['clay', 'wood'])
  })

})
