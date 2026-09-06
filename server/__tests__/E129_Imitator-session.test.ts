import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { setActiveWorkerCount } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/E/E129_Imitator'

const CARD_ID = 'E129_Imitator'
const FILLER = '__test_placeholder__'

type OccupiedSpace = { playerIndex: number; spaceId: string }

const setup = ({
  played = true,
  round = 14,
  dayLaborer = false,
  occupied = [] as OccupiedSpace[],
  familySize = 2,
} = {}) => {
  const session = new GameSession(7129, undefined, { playerCount: 3 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player, index) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setActiveWorkerCount(player, index === 0 ? familySize : 2)
  })

  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  owner.resources.food = played ? 20 : 0

  const nextWorker = new Map<number, number>()
  const occupy = (playerIndex: number, spaceId: string) => {
    const player = state.players[playerIndex]!
    const index = nextWorker.get(playerIndex) ?? 0
    const worker = player.workers.filter((candidate) => candidate.isActive)[index]
    const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)
    if (!worker || !space) throw new Error(`cannot occupy ${spaceId} for player ${playerIndex}`)
    space.takenBy.push({ playerId: player.id, workerId: worker.id })
    nextWorker.set(playerIndex, index + 1)
  }

  if (dayLaborer) occupy(0, 'day-laborer')
  occupied.forEach(({ playerIndex, spaceId }) => occupy(playerIndex, spaceId))
  session.loadState(state)
  return session
}

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const play = (session: GameSession) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = options(response).find((candidate) => candidate.value === CARD_ID)
  if (option) response = session.resolveChoice(response.interaction.playerIndex, option.value)
  return response
}

const occupants = (response: SessionResponse, spaceId: string, playerIndex: number) => {
  const playerId = response.state.players[playerIndex]!.id
  return response.state.actionSpaces.find((space) => space.id === spaceId)?.takenBy
    .filter((worker) => worker.playerId === playerId).length ?? 0
}

describe('E129 Imitator parity', () => {
  it('E129 S1: Imitator can be played as the first occupation in a three-player game', () => {
    const response = play(setup({ played: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('E129 S2: a person on Day Laborer lets Imitator use an opponent-occupied round 1-9 non-accumulating space', () => {
    const session = setup({
      dayLaborer: true,
      occupied: [{ playerIndex: 1, spaceId: 'vegetable-seeds' }],
    })

    const response = session.takeAction(0, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(occupants(response, 'vegetable-seeds', 0)).toBe(1)
    expect(occupants(response, 'vegetable-seeds', 1)).toBe(1)
  })

  it('E129 S3: without a person on Day Laborer an occupied eligible space remains unavailable', () => {
    const session = setup({
      occupied: [{ playerIndex: 1, spaceId: 'vegetable-seeds' }],
    })
    const before = session.getState().state

    const response = session.takeAction(0, 'vegetable-seeds')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before)
  })

  it('E129 S4: Imitator also permits a space occupied by the owner', () => {
    const session = setup({
      familySize: 3,
      dayLaborer: true,
      occupied: [{ playerIndex: 0, spaceId: 'vegetable-seeds' }],
    })

    const response = session.takeAction(0, 'vegetable-seeds')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(occupants(response, 'vegetable-seeds', 0)).toBe(2)
  })

  it('E129 S5: an occupied accumulation space is not enabled by Imitator', () => {
    const session = setup({
      dayLaborer: true,
      occupied: [{ playerIndex: 1, spaceId: 'forest' }],
    })
    const before = session.getState().state

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before)
  })

  it('E129 S6: an unrevealed round 1-9 action space is not enabled early', () => {
    const session = setup({
      round: 1,
      dayLaborer: true,
      occupied: [{ playerIndex: 1, spaceId: 'vegetable-seeds' }],
    })
    const state = session.getState().state
    const vegetableRound = state.roundActionOrder.indexOf('vegetable-seeds') + 1
    expect(vegetableRound).toBeGreaterThan(1)

    const response = session.takeAction(0, 'vegetable-seeds')

    expect(response.ok).toBe(false)
    expect(occupants(response, 'vegetable-seeds', 0)).toBe(0)
  })

  it('E129 S7: an occupied eligible space that the player cannot execute is not enabled', () => {
    const session = setup({
      dayLaborer: true,
      occupied: [{ playerIndex: 1, spaceId: 'wish-children' }],
    })
    const before = session.getState().state

    const response = session.takeAction(0, 'wish-children')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before)
  })

  it('E129 S8: an occupied non-accumulating round 10-14 action space is not enabled', () => {
    const session = setup({
      dayLaborer: true,
      occupied: [{ playerIndex: 1, spaceId: 'cultivation' }],
    })
    const before = session.getState().state

    const response = session.takeAction(0, 'cultivation')

    expect(response.ok).toBe(false)
    expect(response.state).toEqual(before)
  })
})
