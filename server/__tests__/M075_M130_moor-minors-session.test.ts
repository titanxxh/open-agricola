import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { applyFutureMeeples } from '../../shared/session/state-bootstrap'
import { resolveFutureMeepleRequests, futureMeeplesAction } from '../../shared/actions/effects/internal/future-meeples'
import { gainAction } from '../../shared/actions/effects/gain'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'
import { runCardEffectHook } from '../../shared/cards/card-effects'
import type { ActionFlow, ActionSpace, GameState, PlayerState, Resource } from '../../shared/contract/types'

import { M079_PeatSled_impl } from '../../shared/cards/M/M079_PeatSled'
import '../../shared/cards/M/M023_EdgeOfTheForest'
import '../../shared/cards/M/M075_FuelStorage'
import '../../shared/cards/M/M076_Flatboat'
import '../../shared/cards/M/M078_Barge'
import '../../shared/cards/M/M087_PeatBarge'
import '../../shared/cards/M/M103_ForestKindergarten'
import '../../shared/cards/M/M110_FarmCart'
import '../../shared/cards/M/M114_RiversideWoods'
import '../../shared/cards/M/M120_RiverClay'
import '../../shared/cards/M/M124_StoneWagon'
import '../../shared/cards/M/M128_Workbench'
import '../../shared/cards/M/M129_PlowhorseMarket'
import '../../shared/cards/M/M130_Nosebag'

const setup = (round = 1) => {
  const session = new GameSession(374, undefined, {
    playerCount: 2,
    enableFarmersOfTheMoor: true,
    allowIncompleteFarmersOfTheMoorMinorDeal: true,
  })
  session.state.currentPlayerIndex = 0
  session.state.round = round
  session.state.roundPhase = 'work'
  session.state.players.forEach((player, index) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    setWorkersAtHome(session.state, player, index === 0 ? 2 : 0)
  })
  session.loadState(session.state)
  return { session, state: session.state, player: session.state.players[0]! }
}

const playAndResolveFuture = (cardId: string, round: number) => {
  const { session, player } = setup(round)
  player.minorHand = [cardId]
  session.devPlayCard(0, cardId)
  resolveFutureMeepleRequests(session.state)
  return session.state.futureMeeples.filter((entry) => entry.cardId === cardId)
}

const resourcesByRound = (cardId: string, round: number) =>
  playAndResolveFuture(cardId, round).map((entry) => [entry.round, entry.resources] as const)

const space = (id: string): ActionSpace => ({ id } as ActionSpace)

const executeGainLeaf = (flow: ActionFlow | null, state: GameState, player: PlayerState) => {
  expect(flow).toMatchObject({ type: 'leaf', actionId: 'gain' })
  if (!flow || flow.type !== 'leaf') return
  gainAction.execute({
    state,
    player,
    space: space('test'),
    params: flow.params,
    sourceCard: flow.sourceCard,
  })
}

const findListener = (id: string) => {
  const listener = getRegisteredCardListeners().find((entry) => entry.id === id)
  expect(listener).toBeDefined()
  return listener!
}

const enterMinorPrompt = (
  session: GameSession,
  playerIndex: number,
  response: ReturnType<GameSession['takeAction']>,
) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const improvementOption = response.interaction.request.options?.find((option) => option.value.startsWith('action-improvement-'))
  expect(improvementOption).toBeDefined()
  const cardPrompt = session.resolveChoice(playerIndex, improvementOption!.value)
  expect(cardPrompt.ok).toBe(true)
  return cardPrompt
}

const buyMinor = (
  session: GameSession,
  playerIndex: number,
  response: ReturnType<GameSession['takeAction']>,
  cardId: string,
) => {
  const cardPrompt = enterMinorPrompt(session, playerIndex, response)
  if (
    cardPrompt.state.players.some((player) =>
      player.minorPlayed.includes(cardId) || player.minorHand.includes(cardId),
    ) &&
    !cardPrompt.state.players[playerIndex]!.minorHand.includes(cardId)
  ) {
    return cardPrompt
  }
  expect(cardPrompt.interaction.stateId).toBe('wait')
  if (cardPrompt.interaction.stateId !== 'wait') return cardPrompt
  const cardOption = cardPrompt.interaction.request.options?.find((option) => option.value === cardId)
  expect(cardOption).toBeDefined()
  return session.resolveChoice(playerIndex, cardOption!.value)
}

const collectContext = (
  state: GameState,
  player: PlayerState,
  resource: keyof Resource,
  amount: number,
): CardListenerContext => ({
  state,
  player,
  space: space('test-accumulation'),
  actionId: 'collect',
  phase: 'after',
  transactionEvents: [{
    type: 'resource.moved',
    resources: { [resource]: amount },
    from: { kind: 'actionSpace', spaceId: 'test-accumulation' },
    to: { kind: 'player', playerId: player.id },
    reason: 'collect',
  }] as never,
  actionEvents: [{
    type: 'resource.moved',
    resources: { [resource]: amount },
    from: { kind: 'actionSpace', spaceId: 'test-accumulation' },
    to: { kind: 'player', playerId: player.id },
    reason: 'collect',
  }] as never,
} as CardListenerContext)

describe('Moor future resource minors', () => {
  it('M075 Fuel Storage schedules alternating wood and fuel, dropping rounds past 14', () => {
    expect(resourcesByRound('M075_FuelStorage', 3)).toEqual([
      [4, { wood: 1 }],
      [6, { fuel: 1 }],
      [8, { wood: 1 }],
      [10, { fuel: 1 }],
      [12, { wood: 1 }],
      [14, { fuel: 1 }],
    ])
    expect(resourcesByRound('M075_FuelStorage', 10)).toEqual([
      [11, { wood: 1 }],
      [13, { fuel: 1 }],
    ])
  })

  it('M076 Flatboat schedules the next seven rounds, dropping rounds past 14', () => {
    expect(resourcesByRound('M076_Flatboat', 8)).toEqual([
      [9, { fuel: 1 }],
      [10, { horse: 1 }],
      [11, { fuel: 1 }],
      [12, { horse: 1 }],
      [13, { fuel: 1 }],
      [14, { horse: 1 }],
    ])
  })

  it('M078 Barge schedules fuel and food for each remaining round', () => {
    expect(resourcesByRound('M078_Barge', 11)).toEqual([
      [12, { fuel: 1 }],
      [13, { food: 1 }],
      [14, { fuel: 1 }],
    ])
  })

  it('M079 Peat Sled hides expired choices and the selected future fuel resolves', () => {
    const { state, player } = setup(5)
    const flow = M079_PeatSled_impl.effect.onBuy?.(state, player)
    expect(flow?.type).toBe('xor')
    if (flow?.type !== 'xor') throw new Error('expected xor')
    const choices = flow.children.map((child) => {
      if (child.type !== 'leaf') throw new Error('expected leaf')
      const req = child.params?.__futureMeepleRequest as { entries: { round: number; resources: Partial<Resource> }[] }
      return req.entries[0]
    })
    expect(choices).toEqual([
      { round: 7, resources: { fuel: 3 } },
      { round: 9, resources: { fuel: 4 } },
      { round: 12, resources: { fuel: 5 } },
    ])

    const selected = flow.children[1]!
    if (selected.type !== 'leaf') throw new Error('expected leaf')
    futureMeeplesAction.execute({
      state,
      player,
      space: space('future'),
      params: selected.params,
      sourceCard: selected.sourceCard,
    })
    expect(state.futureMeeples).toEqual([
      expect.objectContaining({ cardId: 'M079_PeatSled', round: 9, resources: { fuel: 4 } }),
    ])
    const before = player.resources.fuel ?? 0
    state.round = 9
    applyFutureMeeples(state)
    expect(player.resources.fuel).toBe(before + 4)
    expect(state.futureMeeples).toHaveLength(0)
  })
})

describe('Moor action listener minors', () => {
  it('M023 Edge of the Forest gives food and fuel for fenced forest adjacencies when played', () => {
    const { session, state, player } = setup()
    player.minorHand = ['M023_EdgeOfTheForest']
    player.improvements = ['Major_Fireplace1', 'Major_ClayOven', 'Major_Joinery']
    player.resources.food = 0
    player.resources.fuel = 0
    player.fields = [{ row: 0, col: 1, stacks: [] }]
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 1, col: 0, kind: 'moor' },
      { row: 1, col: 1, kind: 'forest' },
    ]
    player.fenceSegments = [
      { edge: 'V-0-1', type: 'fence' },
      { edge: 'H-1-0', type: 'fence' },
      { edge: 'V-1-1', type: 'fence' },
    ]
    session.loadState(state)
    const foodBefore = player.resources.food
    const fuelBefore = player.resources.fuel ?? 0

    const resp = buyMinor(session, 0, session.takeAction(0, 'meeting-place'), 'M023_EdgeOfTheForest')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 1)
    expect(resp.state.players[0]!.resources.fuel).toBe(fuelBefore + 2)
    expect(resp.state.players[1]!.minorHand).toContain('M023_EdgeOfTheForest')
  })

  it('M103 Forest Kindergarten is playable with at most 3 forests only', () => {
    const { session, state, player } = setup()
    player.minorHand = ['M103_ForestKindergarten']
    player.resources.wood = 1
    player.resources.stone = 2
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
      { row: 0, col: 2, kind: 'forest' },
      { row: 1, col: 2, kind: 'forest' },
    ]
    session.loadState(state)

    const prompt = session.takeAction(0, 'meeting-place')

    expect(prompt.ok).toBe(true)
    expect(prompt.state.players[0]!.minorHand).toContain('M103_ForestKindergarten')
    expect(prompt.state.players[0]!.minorPlayed).not.toContain('M103_ForestKindergarten')
    expect((prompt.interaction.request.options ?? []).some((option) => option.value === 'M103_ForestKindergarten')).toBe(false)
  })

  it('M103 Forest Kindergarten gives food after Family Growth with room', () => {
    const { session, state, player } = setup(2)
    player.minorPlayed.push('M103_ForestKindergarten')
    player.rooms = 3
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
      { row: 1, col: 0, kind: 'moor' },
    ]
    session.loadState(state)
    const foodBefore = player.resources.food

    const resp = session.takeAction(0, 'wish-children')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
  })

  it('M103 Forest Kindergarten gives food after Family Growth without room', () => {
    const { session, state, player } = setup(5)
    player.minorPlayed.push('M103_ForestKindergarten')
    player.rooms = 2
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
      { row: 1, col: 1, kind: 'forest' },
    ]
    session.loadState(state)
    const foodBefore = player.resources.food

    const resp = session.takeAction(0, 'urgent-wish-children')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 3)
  })

  it('M103 Forest Kindergarten does not trigger on non Family Growth actions', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M103_ForestKindergarten')
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
    ]
    session.loadState(state)
    const foodBefore = player.resources.food

    const resp = session.takeAction(0, 'day-laborer')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(foodBefore + 2)
  })

  it('M087 Peat Barge gives 2 fuel after Fishing only', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M087_PeatBarge')
    state.actionSpaces.find((entry) => entry.id === 'fishing')!.resources.food = 2
    session.loadState(state)

    const resp = session.takeAction(0, 'fishing')
    expect(resp.state.players[0]!.resources.fuel).toBe(2)

    const other = setup()
    other.player.minorPlayed.push('M087_PeatBarge')
    other.session.loadState(other.state)
    const nonTrigger = other.session.takeAction(0, 'day-laborer')
    expect(nonTrigger.state.players[0]!.resources.fuel).toBe(0)
  })

  it('M110 Farm Cart gives grain for wood/clay/reed/stone accumulation thresholds only', () => {
    const listener = findListener('M110-farm-cart-after-collect')

    for (const [resource, amount] of [['wood', 5], ['clay', 4], ['reed', 3], ['stone', 2]] as const) {
      const { state, player } = setup()
      player.minorPlayed.push('M110_FarmCart')
      const result = executeCardListener(listener, collectContext(state, player, resource, amount))
      executeGainLeaf(result?.flow ?? null, state, player)
      expect(player.resources.grain).toBe(1)
    }

    const { state, player } = setup()
    player.minorPlayed.push('M110_FarmCart')
    const low = executeCardListener(listener, collectContext(state, player, 'wood', 4))
    expect(low).toBeUndefined()
  })

  it('M114 Riverside Woods gives wood after Fishing based on visible forests', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M114_RiversideWoods')
    player.farmTerrain = [
      { row: 0, col: 0, kind: 'forest' },
      { row: 0, col: 1, kind: 'forest' },
      { row: 0, col: 2, kind: 'moor' },
    ]
    state.actionSpaces.find((entry) => entry.id === 'fishing')!.resources.food = 1
    session.loadState(state)

    const resp = session.takeAction(0, 'fishing')
    expect(resp.state.players[0]!.resources.wood).toBe(2)
  })

  it('M120 River Clay gives 2 clay after Fishing only', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M120_RiverClay')
    state.actionSpaces.find((entry) => entry.id === 'fishing')!.resources.food = 1
    session.loadState(state)
    const resp = session.takeAction(0, 'fishing')
    expect(resp.state.players[0]!.resources.clay).toBe(2)
  })

  it('M124 Stone Wagon gives 1 stone after Day Laborer only', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M124_StoneWagon')
    session.loadState(state)
    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.state.players[0]!.resources.stone).toBe(1)
  })

  it('M129 Plowhorse Market offers food for horse on Farmland and Cultivation only when affordable', () => {
    const listener = findListener('M129-plowhorse-market-after-place-farmer')
    const { state, player } = setup()
    player.minorPlayed.push('M129_PlowhorseMarket')
    player.resources.food = 1
    const farmland = executeCardListener(listener, {
      state,
      player,
      space: space('farmland'),
      actionId: 'place-farmer',
      phase: 'after',
    } as CardListenerContext)
    expect(farmland?.flow).toMatchObject({ type: 'seq', optional: true })

    const cultivation = executeCardListener(listener, {
      state,
      player,
      space: space('cultivation'),
      actionId: 'place-farmer',
      phase: 'after',
    } as CardListenerContext)
    expect(cultivation?.flow).toMatchObject({ type: 'seq', optional: true })

    const nonTrigger = executeCardListener(listener, {
      state,
      player,
      space: space('grain-seeds'),
      actionId: 'place-farmer',
      phase: 'after',
    } as CardListenerContext)
    expect(nonTrigger).toBeUndefined()

    player.resources.food = 0
    const noFood = executeCardListener(listener, {
      state,
      player,
      space: space('farmland'),
      actionId: 'place-farmer',
      phase: 'after',
    } as CardListenerContext)
    expect(noFood).toBeUndefined()
  })

  it('M130 Nosebag gives 1 horse after Grain Seeds only', () => {
    const { session, state, player } = setup()
    player.minorPlayed.push('M130_Nosebag')
    session.loadState(state)
    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.state.players[0]!.resources.horse).toBe(1)

    const other = setup()
    other.player.minorPlayed.push('M130_Nosebag')
    other.session.loadState(other.state)
    const nonTrigger = other.session.takeAction(0, 'day-laborer')
    expect(nonTrigger.state.players[0]!.resources.horse).toBe(0)
  })
})

describe('M128 Workbench harvest field phase', () => {
  it('gives building resources only in rounds 13 and 14', () => {
    for (const round of [13, 14]) {
      const { state, player } = setup(round)
      player.minorPlayed.push('M128_Workbench')
      executeGainLeaf(runCardEffectHook(state, player, 'M128_Workbench', 'onHarvestFieldPhase'), state, player)
      expect(player.resources.wood).toBe(3)
      expect(player.resources.clay).toBe(2)
      expect(player.resources.reed).toBe(1)
    }

    const { state, player } = setup(12)
    player.minorPlayed.push('M128_Workbench')
    expect(runCardEffectHook(state, player, 'M128_Workbench', 'onHarvestFieldPhase')).toBeNull()
  })
})
