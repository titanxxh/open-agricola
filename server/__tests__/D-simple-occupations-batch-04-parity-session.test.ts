import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { getCardStack } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameState, Resource } from '../../shared/contract/types'

import '../../shared/cards/D/D116_TreeInspector'
import '../../shared/cards/D/D120_ClayDeliveryman'
import '../../shared/cards/D/D124_Emissary'
import '../../shared/cards/D/D127_HardworkingMan'
import '../../shared/cards/D/D142_PotatoPlanter'
import '../../shared/cards/D/D162_ClayFirer'

type CardId =
  | 'D116_TreeInspector' | 'D120_ClayDeliveryman' | 'D124_Emissary'
  | 'D127_HardworkingMan' | 'D142_PotatoPlanter' | 'D162_ClayFirer'

const FILLER = '__test_placeholder__'

const setupOccupation = (cardId: CardId, {
  playerCount = 2,
  played = false,
  round = 14,
  resources = {},
}: {
  playerCount?: number
  played?: boolean
  round?: number
  resources?: Partial<Resource>
} = {}) => {
  const session = new GameSession(4054, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    setWorkersAtHome(state, player, 2)
  })
  const player = state.players[0]!
  player.occupationHand = played ? [FILLER] : [cardId]
  player.occupationPlayed = played ? [cardId] : []
  player.resources = {
    ...player.resources,
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
    sheep: 0, boar: 0, cattle: 0, ...resources,
  }
  if (played && (cardId === 'D116_TreeInspector' || cardId === 'D127_HardworkingMan')) {
    state.actionSpaces.push(...createPlayerActionSpaces(state).filter((space) =>
      !state.actionSpaces.some((existing) => existing.id === space.id),
    ))
  }
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: CardId) => {
  let response = session.takeAction(0, 'lessons')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === cardId)
  if (option) response = session.resolveChoice(0, option.value)
  return response
}

const futureRounds = (state: GameState, cardId: CardId, resource: keyof Resource) =>
  state.futureMeeples.filter((entry) => entry.cardId === cardId && (entry.resources[resource] ?? 0) > 0)
    .flatMap((entry) => Array.from({ length: entry.resources[resource] ?? 0 }, () => entry.round))
    .sort((a, b) => a - b)

const occupy = (state: GameState, actionId: string, playerIndex: number) => {
  const space = state.actionSpaces.find((candidate) => candidate.id === actionId)
  if (!space) throw new Error(`${actionId} missing`)
  const player = state.players[playerIndex]!
  const used = state.actionSpaces.flatMap((candidate) => candidate.takenBy).filter((worker) => worker.playerId === player.id)
  const worker = player.workers.find((candidate) => candidate.isActive && !used.some((entry) => entry.workerId === candidate.id))
  if (!worker) throw new Error('no worker available')
  space.takenBy = [{ playerId: player.id, workerId: worker.id }]
}

describe('D116 Tree Inspector parity', () => {
  it('D116 S1: is a private one-wood accumulation space', () => {
    const session = setupOccupation('D116_TreeInspector', { played: true, round: 5 })
    session.state.actionSpaces.find((space) => space.id === 'D116_TreeInspector')!.resources.wood = 1
    session.loadState(session.state)
    const response = session.takeAction(0, 'D116_TreeInspector')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('D116 S2: rejects another player using the private space', () => {
    const session = setupOccupation('D116_TreeInspector', { played: true, round: 5 })
    session.state.currentPlayerIndex = 1
    session.loadState(session.state)
    expect(session.getState().actionAvailability?.D116_TreeInspector).toBe(false)
    const response = session.takeAction(1, 'D116_TreeInspector')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.players[1]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'D116_TreeInspector')?.takenBy).toHaveLength(0)
  })

  it('D116 S3: revealing Western Quarry discards stored wood before one new wood accumulates', () => {
    const session = setupOccupation('D116_TreeInspector', { played: true, round: 6 })
    const state = session.getState().state
    const space = state.actionSpaces.find((candidate) => candidate.id === 'D116_TreeInspector')!
    space.resources.wood = 3
    state.roundActionOrder[6] = 'western-quarry'
    state.players.forEach((player) => { markAllWorkersUsed(state, player); player.resources.food = 20 })
    session.loadState(state)
    const response = session.performRoundEnd()
    expect(response.state.round).toBe(7)
    expect(response.state.actionSpaces.find((candidate) => candidate.id === 'D116_TreeInspector')?.resources.wood).toBe(1)
  })
})

describe('D142 Potato Planter parity', () => {
  const roundEnd = (otherOccupied: boolean) => {
    const session = setupOccupation('D142_PotatoPlanter', { playerCount: 3, played: true, round: 5 })
    const state = session.getState().state
    occupy(state, 'clay-pit', 0)
    if (otherOccupied) occupy(state, 'reed-bank', 1)
    state.players.forEach((player) => { markAllWorkersUsed(state, player); player.resources.food = 20 })
    session.loadState(state)
    return session.performRoundEnd()
  }

  it('D142 S1: owning Clay Pit while Reed Bank is empty grants one vegetable', () => {
    expect(roundEnd(false).state.players[0]!.resources.vegetable).toBe(1)
  })

  it('D142 S2: occupying the respective other accumulation space prevents the vegetable', () => {
    expect(roundEnd(true).state.players[0]!.resources.vegetable).toBe(0)
  })
})

describe('D127 Hardworking Man parity', () => {
  const setup = (eligible: boolean) => {
    const session = setupOccupation('D127_HardworkingMan', { playerCount: 3, played: true })
    session.state.players[1]!.rooms = eligible ? 3 : 2
    session.state.players[2]!.rooms = 3
    session.loadState(session.state)
    return session
  }

  it('D127 S1: when every opponent has more rooms, may take the Day Laborer effect', () => {
    const session = setup(true)
    let response = session.takeAction(0, 'D127_HardworkingMan')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const food = response.interaction.request.options?.find((option) =>
        option.labelKey === 'actions.day-laborer.name' || option.effectPreview?.resourcesGained?.food === 2,
      )
      expect(food).toBeDefined()
      response = session.resolveChoice(0, food!.value)
    }
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('D127 S2: rejects Hardworking Man when an opponent has no more rooms', () => {
    const session = setup(false)
    expect(session.getState().actionAvailability?.D127_HardworkingMan).toBe(false)
    const response = session.takeAction(0, 'D127_HardworkingMan')
    expect(response.ok).toBe(false)
    expect(response.error).toBe('space unavailable')
    expect(response.state.actionSpaces.find((space) => space.id === 'D127_HardworkingMan')?.takenBy).toHaveLength(0)
  })
})

describe('D120 Clay Deliveryman parity', () => {
  it('D120 S1: round five schedules clay on rounds six through fourteen', () => {
    const response = playOccupation(setupOccupation('D120_ClayDeliveryman', { round: 5 }), 'D120_ClayDeliveryman')
    expect(futureRounds(response.state, 'D120_ClayDeliveryman', 'clay')).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14])
  })

  it('D120 S2: round twelve schedules rounds thirteen and fourteen', () => {
    const response = playOccupation(setupOccupation('D120_ClayDeliveryman', { round: 12 }), 'D120_ClayDeliveryman')
    expect(futureRounds(response.state, 'D120_ClayDeliveryman', 'clay')).toEqual([13, 14])
  })
})

describe('D124 Emissary parity', () => {
  const setup = () => {
    const session = setupOccupation('D124_Emissary', { played: true, resources: { wood: 2 } })
    session.takeAction(0, 'farmland')
    return session
  }

  it('D124 S1: may place one wood on the card for one stone', () => {
    const session = setup()
    const response = session.takeAnytimeAction(0, 'D124-emissary-anytime')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(getCardStack(response.state.players[0]!, 'D124_Emissary')).toContain('wood')
  })

  it('D124 S2: the same good cannot be placed twice', () => {
    const session = setup()
    const first = session.takeAnytimeAction(0, 'D124-emissary-anytime')
    expect(first.ok, first.error).toBe(true)
    expect(first.interaction.anytimeActions.map((action) => action.id)).toContain('D124-emissary-anytime')
    const second = session.takeAnytimeAction(0, 'D124-emissary-anytime')
    expect(second.ok, second.error).toBe(true)
    expect(second.state.players[0]!.resources).toMatchObject({ wood: 1, stone: 1 })
    expect(getCardStack(second.state.players[0]!, 'D124_Emissary')).toEqual(['wood', 'stone'])
    expect(second.interaction.anytimeActions.map((action) => action.id)).not.toContain('D124-emissary-anytime')
  })
})

describe('D162 Clay Firer parity', () => {
  it('D162 S1: playing immediately gains two clay', () => {
    const response = playOccupation(setupOccupation('D162_ClayFirer', { playerCount: 4 }), 'D162_ClayFirer')
    expect(response.state.players[0]!.resources.clay).toBe(2)
  })

  it('D162 S2: may exchange three clay for two stone at any time', () => {
    const session = setupOccupation('D162_ClayFirer', {
      playerCount: 4, played: true, resources: { clay: 3 },
    })
    session.takeAction(0, 'farmland')
    session.takeAnytimeAction(0, 'exchange')
    const response = session.resolveChoice(0, 'bulk:1=1')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 2 })
  })
})
