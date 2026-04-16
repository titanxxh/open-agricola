import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
} from '../../shared/cards/card-listeners'

import '../../shared/cards/C/C154_TwinResearcher'

const CARD_ID = 'C154_TwinResearcher'

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)

const setResource = (space: any, key: string, value: number) => {
  space.resources[key] = value
}

describe('C154_TwinResearcher session', () => {
  it('offers pay-gain (1 food -> 1 score) when forest and grove have equal wood', () => {
    const listener = findListener('C154-twin-researcher-before-place-farmer')!
    expect(listener).toBeDefined()

    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 3)
    session.loadState(state)

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeDefined()
    // Expect a pay-gain flow (sequence with pay-resources then bonus-vp)
    const flow = result!.flow as any
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    const childActionIds = flow.children.map((c: any) => c.actionId)
    expect(childActionIds).toContain('pay-resources')
    expect(childActionIds).toContain('bonus-vp')
  })

  it('does not trigger when counts differ', () => {
    const listener = findListener('C154-twin-researcher-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 5)
    session.loadState(state)

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

  it('triggers on clay-pit when it matches hollow-4', () => {
    const listener = findListener('C154-twin-researcher-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3

    const clayPit = state.actionSpaces.find((s) => s.id === 'clay-pit')
    const hollow4 = state.actionSpaces.find((s) => s.id === 'hollow-4')
    if (!clayPit || !hollow4) return
    setResource(clayPit, 'clay', 2)
    setResource(hollow4, 'clay', 2)
    session.loadState(state)

    const result = executeCardListener(listener, {
      state,
      player,
      space: clayPit,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeDefined()
  })

  it('does not trigger on non-pair spaces', () => {
    const listener = findListener('C154-twin-researcher-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 3
    session.loadState(state)

    const farmland = state.actionSpaces.find((s) => s.id === 'farmland')!
    const result = executeCardListener(listener, {
      state,
      player,
      space: farmland,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger when player has no food', () => {
    const listener = findListener('C154-twin-researcher-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.occupationPlayed.push(CARD_ID)
    player.resources.food = 0

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 3)
    session.loadState(state)

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })

  it('does not trigger without the card', () => {
    const listener = findListener('C154-twin-researcher-before-place-farmer')!
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.resources.food = 3

    const forest = state.actionSpaces.find((s) => s.id === 'forest')!
    const grove = state.actionSpaces.find((s) => s.id === 'grove')!
    setResource(forest, 'wood', 3)
    setResource(grove, 'wood', 3)
    session.loadState(state)

    const result = executeCardListener(listener, {
      state,
      player,
      space: forest,
      actionId: 'place-farmer',
      phase: 'before',
    } as any)
    expect(result).toBeUndefined()
  })
})
