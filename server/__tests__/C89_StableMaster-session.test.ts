import { type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'

import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/C/C089_StableMaster'
import '../../shared/cards/C/C088_CarpentersApprentice'

describe('C089_StableMaster session', () => {
  const setup = () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.occupationHand.push('C089_StableMaster')
    session.loadState(state)
    session.devPlayCard(0, 'C089_StableMaster')
    return session
  }

  it('first unfenced stable has capacity 3', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Add an unfenced stable
    player.stableTiles.push({ row: 0, col: 2 })
    // No pastures covering this tile, so it's unfenced

    const zones = computeAnimalZones(player)
    const stableZone = zones.find(z => z.zoneType === 'stable')
    expect(stableZone).toBeDefined()
    expect(stableZone!.capacity).toBe(3) // 1 + 2
  })

  it('second unfenced stable still has capacity 1', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Add two unfenced stables
    player.stableTiles.push({ row: 0, col: 2 })
    player.stableTiles.push({ row: 0, col: 3 })

    const zones = computeAnimalZones(player)
    const stableZones = zones.filter(z => z.zoneType === 'stable')
    expect(stableZones.length).toBe(2)

    // First stable gets the bonus
    expect(stableZones[0]!.capacity).toBe(3)
    // Second stable remains at default
    expect(stableZones[1]!.capacity).toBe(1)
  })

  it('no effect without unfenced stables', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // No stables at all
    const zones = computeAnimalZones(player)
    const stableZones = zones.filter(z => z.zoneType === 'stable')
    expect(stableZones.length).toBe(0)
  })

  it('no effect without the card', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.stableTiles.push({ row: 0, col: 2 })
    session.loadState(state)

    const zones = computeAnimalZones(player)
    const stableZone = zones.find(z => z.zoneType === 'stable')
    expect(stableZone).toBeDefined()
    expect(stableZone!.capacity).toBe(1) // default, no bonus
  })

  it('onBuy returns optional stables flow with exact 1 wood cost', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C089_StableMaster')
    player.resources.wood = 1
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C089_StableMaster', 'onBuy')
    expect(flow).not.toBeNull()
    const leaf = flow as Extract<ActionFlow, { type: 'leaf' }>
    expect(leaf.type).toBe('leaf')
    expect(leaf.actionId).toBe('stables')
    expect(leaf.optional).toBe(true)
    expect(leaf.actionContext).toMatchObject({
      max: 1,
      exactCost: { wood: 1 },
      trueAction: false,
    })
    expect(leaf.actionContext?.costOverride).toBeUndefined()
  })

  it('onBuy skipped if player has 4 stables built', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C089_StableMaster')
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 0 },
    ]
    player.resources.wood = 5
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C089_StableMaster', 'onBuy')
    expect(flow).toBeNull()
  })

  it('onBuy skipped if consumed stable tokens exhaust reserve', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C089_StableMaster')
    player.resources.wood = 5
    player.supplyTokensConsumed = { stable: 4 }
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C089_StableMaster', 'onBuy')
    expect(flow).toBeNull()
  })

  it('onBuy returns stables flow even when wood is paid by a stables cost modifier', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed.push('C089_StableMaster')
    player.occupationPlayed.push('C088_CarpentersApprentice')
    player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    player.resources.wood = 0
    session.loadState(state)

    const flow = runCardEffectHook(state, player, 'C089_StableMaster', 'onBuy')
    expect(flow).not.toBeNull()
  })

  it('onBuy stable can be built with C88 discount and no wood', () => {
    const session = new GameSession(undefined, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 1
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    }
    const player = state.players[0]!
    player.occupationPlayed = ['C088_CarpentersApprentice']
    player.occupationHand = ['C089_StableMaster']
    player.resources.food = 10
    player.resources.wood = 0
    player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    session.loadState(state)

    const action = session.takeAction(0, 'lessons-4')
    expect(action.ok).toBe(true)
    expect(action.interaction.stateId).toBe('wait')
    if (action.interaction.stateId !== 'wait') return
    const stableOption = action.interaction.request.options?.find((entry) => entry.labelKey === 'actions.stables.name')
    expect(stableOption).toBeDefined()

    const prompt = session.resolveChoice(0, stableOption!.value)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(prompt.interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 1, col: 4 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toHaveLength(3)
  })
})

describe('C089 Stable Master parity', () => {
  const CARD_ID = 'C089_StableMaster'

  const FILLER = '__test_placeholder__'

  const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
    ? response.interaction.request.options ?? []
    : []

  const setup = ({
    played = true, wood = 0, stables = [] as Array<{ row: number; col: number }>, fenced = false,
  } = {}) => {
    const session = new GameSession(6089, undefined, { playerCount: 2 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    state.players.forEach((player, index) => {
      setWorkersAtHome(state, player, index === 0 ? 2 : 0)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.stableTiles = []
      player.stableAnimals = {}
      player.pastures = []
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      player.resources = {
        ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
        vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
      }
    })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [CARD_ID]
    owner.occupationPlayed = played ? [CARD_ID] : []
    owner.resources.wood = wood
    owner.stableTiles = [...stables]
    if (fenced) {
      owner.pastures = [{
        id: 'stable-master-pasture', size: 1, tiles: [stables[0]!], stables: 1,
        animalType: null, animalCount: 0,
      }]
    }
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (sheepMarket) sheepMarket.resources.sheep = 3
    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    if (response.interaction.stateId !== 'wait') return response
    const card = options(response).find((option) => option.value === CARD_ID)
    expect(card, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, card!.value)
  }

  const acceptStable = (session: GameSession, response: SessionResponse) => {
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const accept = options(response).find((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)
      ?? options(response).find((option) => option.value !== '__skip__')
    expect(accept, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(response.interaction.playerIndex, accept!.value)
  }

  const animalZones = (response: SessionResponse) => {
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'animal-reorg' },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'animal-reorg') return []
    return response.interaction.request.zones
  }

  it('C089 S1: playing Stable Master may pay one wood to build exactly one stable', () => {
    const session = setup({ played: false, wood: 1 })
    let response = acceptStable(session, playOccupation(session))
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    if (response.interaction.stateId !== 'wait'
      || response.interaction.request.kind !== 'farm-select') return
    const stable = response.interaction.request.farm.selectableTiles[0]
    expect(stable).toBeDefined()

    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('C089 S2: the immediate stable may be declined without paying wood', () => {
    const session = setup({ played: false, wood: 1 })
    const offered = playOccupation(session)
    expect(options(offered).some((option) => option.value === '__skip__')).toBe(true)

    const response = session.resolveChoice(offered.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.stableTiles).toHaveLength(0)
    expect(response.state.players[0]!.resources.wood).toBe(1)
  })

  it('C089 S3: without wood Stable Master can only be declined without building or paying', () => {
    const session = setup({ played: false, wood: 0 })
    const offered = playOccupation(session)

    expect(offered.ok, offered.error).toBe(true)
    expect(offered.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(options(offered).filter((option) =>
      option.value !== '__skip__' && option.sourceCard === CARD_ID)).toHaveLength(0)
    expect(offered.state.players[0]!.stableTiles).toHaveLength(0)
    expect(offered.state.players[0]!.resources.wood).toBe(0)
  })

  it('C089 S6: a fenced stable is not the special unfenced stable', () => {
    const response = setup({
      stables: [{ row: 0, col: 2 }, { row: 0, col: 4 }], fenced: true,
    }).takeAction(0, 'sheep-market')

    const zones = animalZones(response)
    expect(zones.filter((zone) => zone.zoneType === 'stable').map((zone) => zone.capacity)).toEqual([3])
    expect(zones.find((zone) => zone.zoneType === 'pasture')?.capacity).toBe(4)
  })
})
