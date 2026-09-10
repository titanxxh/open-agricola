import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import type { AnimalType } from '../../shared/contract/types'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { D140_Loudmouth_impl } from '../../shared/cards/D/D140_Loudmouth'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { Resource } from '../../shared/contract/types'

import '../../shared/cards/D/D140_Loudmouth'

const CARD_ID = 'D140_Loudmouth'
const LISTENER = D140_Loudmouth_impl.listeners[0]!

const moved = (
  resources: Partial<Resource>,
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'forest' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId: 'p1' },
  reason: from.kind === 'actionSpace' ? 'collect' : 'cardEffect',
})

const directContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.occupationPlayed.push(CARD_ID)
  return {
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'forest')!,
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    actionEvents: transactionEvents,
    result: { type: 'ok', resourcesGained: { wood: 4 } },
  } as unknown as CardListenerContext
}

describe('D140_Loudmouth session', () => {
  it('grants food for 4+ building resources from an action space without result gains', () => {
    const ctx = directContext([moved({ wood: 4 })])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('grants food for 4+ animals from an action space without result gains', () => {
    const ctx = directContext([moved({ sheep: 4 }, { kind: 'actionSpace', spaceId: 'sheep-market' })])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'gain',
      params: { food: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger below threshold', () => {
    const ctx = directContext([moved({ wood: 3 })])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger for supply/cardEffect resources even when result reports threshold', () => {
    const ctx = directContext([moved({ wood: 4 }, { kind: 'supply' })])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })
})

describe('D140 Loudmouth parity', () => {
  const CARD_ID = 'D140_Loudmouth'

  const FILLER = '__test_placeholder__'

  type ZoneAssignment = {
    id: string
    zoneType: 'pasture' | 'house' | 'card'
    animalType: AnimalType | null
    animalCount: number
  }

  const setup = ({ played = true, actor = 0 } = {}) => {
    const session = new GameSession(6140, undefined, { playerCount: 3 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = actor
    state.round = 14
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === actor ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.pastures = []
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    session.loadState(state)
    return session
  }

  const setSpaceResources = (session: GameSession, spaceId: string, resources: Record<string, number>) => {
    const state = session.getState().state
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
    space.resources = { ...space.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      sheep: 0, boar: 0, cattle: 0, ...resources }
    session.loadState(state)
  }

  it('D140 S2: collecting four wood from Forest gains one additional food', () => {
    const session = setup()
    setSpaceResources(session, 'forest', { wood: 4 })

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 4, food: 1 })
  })

  it('D140 S3: four mixed building resources from one accumulation space gain food', () => {
    const session = setup()
    setSpaceResources(session, 'forest', { wood: 2, clay: 2 })

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, clay: 2, food: 1 })
  })

  it('D140 S4: collecting four sheep from an accumulation space gains one food', () => {
    const session = setup()
    const state = session.getState().state
    state.players[0]!.pastures = [
      {
        id: 'pasture-0', size: 1, tiles: [{ row: 0, col: 2 }], stables: 0,
        animalType: null, animalCount: 0,
      },
      {
        id: 'pasture-1', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: null, animalCount: 0,
      },
    ]
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = 4
    session.loadState(state)

    let response = session.takeAction(0, 'sheep-market')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    if (response.interaction.stateId === 'wait'
      && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(0, 'confirm', [{
        id: 'pasture-0', zoneType: 'pasture', animalType: 'sheep', animalCount: 2,
      }, {
        id: 'pasture-1', zoneType: 'pasture', animalType: 'sheep', animalCount: 2,
      }] satisfies ZoneAssignment[] as unknown as Record<string, unknown>)
    }

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 4, food: 1 })
  })

  it('D140 S5: collecting only three building resources grants no food', () => {
    const session = setup()
    setSpaceResources(session, 'forest', { wood: 3 })

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
  })

  it('D140 S6: collecting four food from an accumulation space grants no extra food', () => {
    const session = setup()
    setSpaceResources(session, 'fishing', { food: 4 })

    const response = session.takeAction(0, 'fishing')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(4)
  })

  it('D140 S7: an opponent collecting four wood gives the owner no food', () => {
    const session = setup({ actor: 1 })
    setSpaceResources(session, 'forest', { wood: 4 })

    const response = session.takeAction(1, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[1]!.resources).toMatchObject({ wood: 4, food: 0 })
    expect(response.state.players[0]!.resources.food).toBe(0)
  })
})
