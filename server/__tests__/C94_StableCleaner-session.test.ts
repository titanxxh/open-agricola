import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C094_StableCleaner'
import '../../shared/cards/C/C088_CarpentersApprentice'
import type { ActionFlow } from '../../shared/contract/types'

const CARD_ID = 'C094_StableCleaner'
const LISTENER_ID = 'C94-stable-cleaner-anytime'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setupParity = ({ inHand = false, wood = 0, food = 0 } = {}) => {
  const session = new GameSession()
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const player = state.players[0]!
  player.occupationHand = inHand ? [CARD_ID] : ['__test_placeholder__']
  player.occupationPlayed = inHand ? [] : [CARD_ID]
  player.resources = { ...player.resources, wood, food }
  session.loadState(state)
  return session
}

describe('C094 Stable Cleaner parity', () => {
  it('C094 S1: playing Stable Cleaner through Lessons keeps the occupation in play', () => {
    const response = setupParity({ inHand: true }).takeAction(0, 'lessons')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  it('C094 S2: the anytime action builds two stables for two wood and two food', () => {
    const session = setupParity({ wood: 2, food: 2 })
    const action = session.takeAction(0, 'farmland')
    expect(action.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(true)

    const selection = session.takeAnytimeAction(0, LISTENER_ID)
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'stable') return
    const response = session.commitSelectionChoice(0, {
      stables: selection.interaction.request.farm.selectableTiles.slice(0, 2),
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(2)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
  })

  it('C094 S3: lacking either wood or food keeps the anytime action unavailable', () => {
    const noWood = setupParity({ food: 1 }).takeAction(0, 'farmland')
    const noFood = setupParity({ wood: 1 }).takeAction(0, 'farmland')

    expect(noWood.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(false)
    expect(noFood.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(false)
  })

  it('C094 S4: completing the stable action makes Stable Cleaner available again', () => {
    const session = setupParity({ wood: 2, food: 2 })
    session.takeAction(0, 'farmland')
    const selection = session.takeAnytimeAction(0, LISTENER_ID)
    expect(selection.interaction.stateId).toBe('wait')
    if (selection.interaction.stateId !== 'wait' || selection.interaction.request.farm.farmType !== 'stable') return

    const response = session.commitSelectionChoice(0, {
      stables: [selection.interaction.request.farm.selectableTiles[0]!],
    })

    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(true)
  })
})

/**
 * C94 Stable Cleaner — At any time, you can take the Build Stables action
 * without placing a person. If you do, each stable costs you 1 wood + 1 food.
 *
 * Rule: anytime + flagCardNode + STABLES action with costs={WOOD=>1, FOOD=>1}.
 *
 */
describe('C094_StableCleaner — exact cost 1 wood + 1 food', () => {
  const setupContext = (
    resources: { wood?: number; food?: number },
    stableTilesLength = 0,
    consumedStables = 0,
  ) => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources = {
      ...player.resources,
      wood: resources.wood ?? 0,
      food: resources.food ?? 0,
    }
    player.stableTiles = Array.from({ length: stableTilesLength }, (_, i) => ({
      row: 1,
      col: i + 1,
    }))
    player.supplyTokensConsumed = consumedStables > 0 ? { stable: consumedStables } : {}
    session.loadState(state)
    return {
      state,
      player,
      actionId: 'stables',
      phase: 'anytime' as const,
    } as unknown as CardListenerContext
  }

  it('emits stables flow with exactCost { wood:1, food:1 } when player has 1 wood + 1 food', () => {
    const listener = findListener(LISTENER_ID)
    expect(listener).toBeDefined()

    const ctx = setupContext({ wood: 1, food: 1 })
    const result = executeCardListener(listener!, ctx)
    expect(result?.flow).toBeDefined()
    const seq = result!.flow as Extract<ActionFlow, { type: 'seq' }>
    expect(seq.type).toBe('seq')

    const stablesLeaf = seq.children.find(
      (c) => c.type === 'leaf' && c.actionId === 'stables',
    ) as Extract<ActionFlow, { type: 'leaf' }> | undefined
    expect(stablesLeaf).toBeDefined()
    expect(stablesLeaf!.actionContext).toBeDefined()
    expect(stablesLeaf!.actionContext!.exactCost).toEqual({ wood: 1, food: 1 })
    expect(stablesLeaf!.actionContext!.costOverride).toBeUndefined()
    expect(stablesLeaf!.actionContext!.trueAction).toBe(false)
    expect(stablesLeaf!.sourceCard).toBe(CARD_ID)
  })

  it('emits with no wood when a stables cost modifier covers the wood', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 0, food: 5 }, 2)
    ctx.player.occupationPlayed.push('C088_CarpentersApprentice')
    const result = executeCardListener(listener, ctx)
    expect(result?.flow).toBeDefined()
  })

  it('does NOT emit when player lacks food (no 1 food)', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 5, food: 0 })
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('does NOT emit when player already has 4 stables', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 5, food: 5 }, 4)
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('does NOT emit when consumed stable tokens exhaust reserve', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 5, food: 5 }, 0, 4)
    const result = executeCardListener(listener, ctx)
    expect(result).toBeUndefined()
  })

  it('emits when player has 3 stables and resources (room for 1 more)', () => {
    const listener = findListener(LISTENER_ID)!
    const ctx = setupContext({ wood: 1, food: 1 }, 3)
    const result = executeCardListener(listener, ctx)
    expect(result?.flow).toBeDefined()
  })

  it('anytime stable can be built with C88 discount and no wood', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    const player = state.players[0]!
    player.occupationPlayed = [CARD_ID, 'C088_CarpentersApprentice']
    player.resources.food = 1
    player.resources.wood = 0
    player.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    session.loadState(state)

    const action = session.takeAction(0, 'farmland')
    expect(action.ok).toBe(true)
    expect(action.interaction.anytimeActions.some((entry) => entry.id === LISTENER_ID)).toBe(true)

    const prompt = session.takeAnytimeAction(0, LISTENER_ID)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(prompt.interaction.request.kind).toBe('farm-select')

    const built = session.commitSelectionChoice(0, {
      stables: [{ row: 1, col: 4 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.resources.food).toBe(0)
    expect(built.state.players[0]!.stableTiles).toHaveLength(3)
  })
})
