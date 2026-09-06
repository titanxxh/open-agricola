import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C117_Legworker'
import { hasAdjacentWorker } from '../../shared/cards/C/C117_Legworker'
import type { ActionFlow } from '../../shared/contract/types'


const CARD_ID = 'C117_Legworker'
const FILLER = '__test_placeholder__'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setupParity = ({ played = true } = {}) => {
  const session = new GameSession(5117, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
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
  player.occupationHand = played ? [FILLER] : [CARD_ID]
  player.occupationPlayed = played ? [CARD_ID] : []
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  const clayPit = state.actionSpaces.find((space) => space.id === 'clay-pit')!
  forest.resources = { ...forest.resources, wood: 0 }
  clayPit.resources = { ...clayPit.resources, clay: 0 }
  session.loadState(state)
  return session
}

const occupy = (session: GameSession, playerIndex: number, spaceId: string) => {
  const state = session.getState().state
  const player = state.players[playerIndex]!
  const occupiedWorkerIds = new Set(state.actionSpaces.flatMap((space) =>
    space.takenBy.filter((ref) => ref.playerId === player.id).map((ref) => ref.workerId)))
  const worker = player.workers.find((candidate) => candidate.isActive && !occupiedWorkerIds.has(candidate.id))
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
  if (!worker || !space) throw new Error(`cannot occupy ${spaceId}`)
  space.takenBy.push({ playerId: player.id, workerId: worker.id })
  session.loadState(state)
}

const playOccupation = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

describe('C117_Legworker session', () => {
  it('hasAdjacentWorker returns true when owner occupies neighbour', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    // Force farmland and grain-seeds into the state (common spaces)
    // grain-seeds is adjacent to farmland in COMMON_ADJACENCY for farmland.
    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!farmland || !grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    expect(hasAdjacentWorker(state, player.id, 'farmland')).toBe(true)
  })

  it('hasAdjacentWorker returns false when neighbour is taken by opponent', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    const opponent = state.players[1]!
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: opponent.id, workerId: "1" }]
    session.loadState(state)

    expect(hasAdjacentWorker(state, player.id, 'farmland')).toBe(false)
  })

  it('hasAdjacentWorker returns false when no neighbour is occupied', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    session.loadState(state)
    expect(hasAdjacentWorker(state, state.players[0]!.id, 'farmland')).toBe(false)
  })

  it('after-place-farmer gains 1 wood when adjacent to own worker', () => {
    const listener = findListener('C117-legworker-after-place-farmer')!
    expect(listener).toBeDefined()
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    const grainSeeds = state.actionSpaces.find((s) => s.id === 'grain-seeds')
    if (!grainSeeds) return
    grainSeeds.takenBy = [{ playerId: player.id, workerId: "1" }]
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeDefined()
    const leaf = result!.flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.actionId).toBe('gain')
    expect(leaf.params).toEqual({ wood: 1 })
    expect(leaf.sourceCard).toBe(CARD_ID)
  })

  it('does not trigger when no adjacent worker', () => {
    const listener = findListener('C117-legworker-after-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'after',
    } as unknown as CardListenerContext)
    expect(result).toBeUndefined()
  })

  it('C117 S1: Legworker can be played as the first occupation for no food', () => {
    const session = setupParity({ played: false })
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('C117 S2: using an empty Forest adjacent to your Grain Seeds worker gains one wood', () => {
    const session = setupParity()
    occupy(session, 0, 'grain-seeds')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy).toHaveLength(1)
  })

  it('C117 S3: an opponent on adjacent Grain Seeds does not grant wood', () => {
    const session = setupParity()
    occupy(session, 1, 'grain-seeds')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C117 S4: your worker on nonadjacent Day Laborer does not grant wood at Forest', () => {
    const session = setupParity()
    occupy(session, 0, 'day-laborer')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C117 S5: round-space adjacency is resolved through the current action-card layout', () => {
    const session = setupParity()
    const roundFive = session.state.roundActionOrder[4]
    expect(roundFive).toBeTruthy()
    occupy(session, 0, roundFive!)

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C117 S6: Forest and Clay Pit are mutually adjacent for Legworker', () => {
    const session = setupParity()
    occupy(session, 0, 'forest')

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 0 })
  })

  it('C117 S7: without Legworker the same empty adjacent placement grants no wood', () => {
    const session = setupParity({ played: false })
    const state = session.getState().state
    state.players[0]!.occupationHand = [FILLER]
    session.loadState(state)
    occupy(session, 0, 'grain-seeds')

    const response = session.takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

})
