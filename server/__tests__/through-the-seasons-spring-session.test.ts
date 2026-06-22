import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { storePendingFenceBonus } from '../../shared/cards/helpers/pending-fence-bonus'
import { setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A65_SeedPellets'

type SeasonId = 'winter' | 'spring' | 'summer' | 'autumn'
type SeasonsState = {
  enableThroughTheSeasons?: boolean
  throughTheSeasons?: {
    startSeason: SeasonId
    currentSeason: SeasonId
  } | null
}

const springActionId = 'season-spring-animal-and-fruit'

const oneCellFences = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const springPalisadeFenceEdges = ['H-1-0', 'V-0-1']
const springPalisadeEdges = ['H-0-0', 'V-0-0']

const seasonsOf = (session: GameSession) => session.state as typeof session.state & SeasonsState

const setupSpring = () => {
  const session = new GameSession(351, undefined, {
    playerCount: 2,
    enableThroughTheSeasons: true,
  } as never)
  const state = seasonsOf(session)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  state.roundActionOrder[0] = 'fencing'
  state.throughTheSeasons = { startSeason: 'spring', currentSeason: 'spring' }
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  const player = state.players[0]!
  setActiveWorkerCount(player, 2)
  setWorkersAtHome(state, player, 2)
  session.loadState(state)
  return session
}

const availableIds = (session: GameSession, playerIndex = 0) =>
  session.getAvailableActions(playerIndex).map((action) => action.spaceId)

const chooseByLabel = (
  session: GameSession,
  resp: SessionResponse,
  labelKey: string,
) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
  const option = resp.interaction.options?.find((entry) => entry.labelKey === labelKey)
  expect(option).toBeDefined()
  return session.resolveChoice(resp.interaction.playerIndex, option!.value)
}

describe('Through the Seasons Spring rules', () => {
  it('offers Animal and Fruit choices for breeding, sowing, and both orders', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.resources.sheep = 2
    player.pastures = [{
      id: 'pasture-1',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]

    const resp = session.takeAction(0, springActionId)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected choice prompt')
    expect(resp.interaction.options?.map((option) => option.labelKey)).toEqual(
      expect.arrayContaining([
        'actions.breed.name',
        'actions.sow.name',
        'actions.season-spring-animal-and-fruit.option-breed-sow',
        'actions.season-spring-animal-and-fruit.option-sow-breed',
      ]),
    )
  })

  it('keeps Animal and Fruit unavailable when neither breeding nor sowing can happen', () => {
    const session = setupSpring()

    expect(availableIds(session)).not.toContain(springActionId)
    expect(session.takeAction(0, springActionId)).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
  })

  it('runs private breeding only for the acting player without harvest summary', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    const opponent = session.state.players[1]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.resources.sheep = 2
    opponent.resources.sheep = 2
    player.pastures = [{
      id: 'pasture-1',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]
    opponent.pastures = [{
      id: 'pasture-2',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]

    const resp = chooseByLabel(
      session,
      session.takeAction(0, springActionId),
      'actions.breed.name',
    )

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
    expect(resp.state.players[1]!.resources.sheep).toBe(2)
    expect(resp.state.harvestBreedSummary).toBeUndefined()
  })

  it('runs Spring sowing through the ordinary sow farm selection', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]

    let resp = session.takeAction(0, springActionId)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')
    expect(resp.interaction.farm.farmType).toBe('sow')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('uses hook-dispatched sow doability when building Animal and Fruit branches', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.minorPlayed.push('A65_SeedPellets')
    player.resources.grain = 0
    player.fields = [{ row: 0, col: 0, stacks: [] }]

    expect(availableIds(session)).toContain(springActionId)
    let resp = session.takeAction(0, springActionId)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.fields).toContainEqual({
      row: 0,
      col: 0,
      stacks: [{ kind: 'grain', remaining: 3 }],
    })
  })

  it('can resolve Sow then Breeding in the chosen order', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.grain = 1
    player.fields = [{ row: 0, col: 0, stacks: [] }]
    player.resources.sheep = 2
    player.pastures = [{
      id: 'pasture-1',
      size: 3,
      tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 0, col: 3 }],
      stables: 0,
      animalType: 'sheep',
      animalCount: 2,
    }]

    let resp = chooseByLabel(
      session,
      session.takeAction(0, springActionId),
      'actions.season-spring-animal-and-fruit.option-sow-breed',
    )
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected sow prompt')
    expect(resp.interaction.promptKey).toBe('ui.interactionSowSelect')

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 0, crop: 'grain' }],
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.grain).toBe(0)
    expect(resp.state.players[0]!.resources.sheep).toBe(3)
  })

  it('lets Spring fencing build 4 ordinary fences for 2 wood in one payment', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 2

    expect(availableIds(session)).toContain('fencing')
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: oneCellFences(0, 0),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(4)
  })

  it('does not let Spring free fences reduce an ordinary fence payment below 1 wood', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 1
    storePendingFenceBonus(player, {
      sourceCard: 'TestFenceBonus',
      counterKey: 'fences',
      freeFences: 3,
    })

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: oneCellFences(0, 0),
      extraWood: 0,
    })

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.wood).toBe(0)
  })

  it('keeps Spring fencing unavailable without one payable wood', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 0

    expect(availableIds(session)).not.toContain('fencing')
    expect(session.takeAction(0, 'fencing')).toMatchObject({
      ok: false,
      error: 'space unavailable',
    })
    expect(session.state.actionSpaces.find((space) => space.id === 'fencing')?.takenBy).toEqual([])
  })

  it('does not apply Spring free fences to palisades', () => {
    const session = setupSpring()
    const player = session.state.players[0]!
    player.resources.wood = 4
    player.minorPlayed.push('B30_WoodPalisades')

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: springPalisadeFenceEdges,
      palisadeEdges: springPalisadeEdges,
      extraWood: 0,
    })

    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.resources.wood).toBe(4)
    expect(resp.state.players[0]!.fenceSegments).toHaveLength(0)
  })
})
