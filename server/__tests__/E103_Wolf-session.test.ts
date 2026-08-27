import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { E103_Wolf_impl } from '../../shared/cards/E/E103_Wolf'
import type { DraftGameEvent } from '../../shared/contract/events'
import '../../shared/cards/E/E103_Wolf'

const CARD_ID = 'E103_Wolf'

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { grain: 1 },
  from: { kind: 'actionSpace', spaceId: 'grain-seeds' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'gain',
  ...overrides,
})

const setup = () => {
  const session = new GameSession(103, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.players.forEach((p) => {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  })

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.occupationHand = [CARD_ID]

  session.loadState(state)
  session.devPlayCard(0, CARD_ID)
  return session
}

describe('E103_Wolf session', () => {
  it('onBuy pushes stack [clay, wood, grain]', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(player.cardStates?.[CARD_ID]?.stack).toEqual(['clay', 'wood', 'grain'])
  })

  it('gaining grain (top of stack) pops it and gives 1 boar', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.grain = 0
    player.resources.boar = 0

    // Make grain-seeds available
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-seeds'
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    // Got 1 grain from grain-seeds + stack popped grain + gained 1 boar
    expect(updatedPlayer.resources.grain).toBe(1)
    expect(updatedPlayer.resources.boar).toBe(1)
    // Stack should now be [clay, wood]
    expect(updatedPlayer.cardStates?.[CARD_ID]?.stack).toEqual(['clay', 'wood'])
  })

  it('gaining a non-matching resource does not trigger', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.resources.wood = 0
    player.resources.boar = 0

    // Use day-laborer to gain food (not grain, not matching top)
    session.loadState(state)

    const resp = session.takeAction(0, 'day-laborer')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.boar).toBe(0)
    // Stack unchanged
    expect(updatedPlayer.cardStates?.[CARD_ID]?.stack).toEqual(['clay', 'wood', 'grain'])
  })

  it('after all 3 items popped, no more triggers', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // Manually empty the stack
    player.cardStates![CARD_ID]!.stack = []
    player.resources.grain = 0
    player.resources.boar = 0

    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-seeds'
    session.loadState(state)

    const resp = session.takeAction(0, 'grain-seeds')
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.grain).toBe(1)
    expect(updatedPlayer.resources.boar).toBe(0) // no boar, stack empty
  })

  it('collecting wood (second item) triggers after grain is popped', () => {
    const session = setup()
    const state = session.getState().state
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    // Pop grain already, so top is now 'wood'
    player.cardStates![CARD_ID]!.stack = ['clay', 'wood']
    player.resources.wood = 0
    player.resources.boar = 0

    const woodSpace = state.actionSpaces.find((s) => s.id === 'forest')
    expect(woodSpace).toBeDefined()
    woodSpace!.resources.wood = 1

    state.roundActionOrder = state.roundActionOrder.map(() => null)
    session.loadState(state)

    const resp = session.takeAction(0, woodSpace.id)
    expect(resp.ok).toBe(true)

    const updatedPlayer = resp.state.players[0]!
    expect(updatedPlayer.resources.boar).toBe(1)
    expect(updatedPlayer.cardStates?.[CARD_ID]?.stack).toEqual(['clay'])
  })

  it('reacts to Interim Storage payout at the start of round 7', () => {
    const session = setup()
    const state = session.getState().state
    state.round = 6
    state.roundPhase = 'work'
    state.players.forEach((entry) => {
      setActiveWorkerCount(entry, 2)
      markAllWorkersUsed(state, entry)
      entry.resources.food = 10
    })

    const player = state.players[0]!
    player.minorPlayed.push('A081_InterimStorage')
    player.cardStates!.A081_InterimStorage = { counters: { wood: 1 } }
    player.cardStates![CARD_ID]!.stack = ['clay', 'wood']
    player.resources.wood = 0
    player.resources.boar = 0
    session.loadState(state)

    let resp = session.performRoundEnd()

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.round).toBe(7)
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, boar: 1 })
    expect(resp.state.players[0]!.cardStates?.A081_InterimStorage?.counters?.wood).toBe(0)
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.stack).toEqual(['clay'])
    if (resp.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
    expect(resp.interaction.request.kind).toBe('animal-reorg')
    if (resp.interaction.request.kind !== 'animal-reorg') throw new Error('expected animal reorganization')

    const zones = resp.interaction.request.zones.map((zone) =>
      zone.zoneType === 'house'
        ? { ...zone, animalType: 'boar' as const, animalCount: 1 }
        : zone,
    )
    resp = session.resolveChoice(resp.interaction.playerIndex, 'confirm', zones)

    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('idle')
    expect(resp.state.players[0]!.resources).toMatchObject({ wood: 1, boar: 1 })
  })

  it('uses resource.moved events for matching stack top even when result has no resourcesGained', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.id = 'p1'

    const result = executeCardListener(E103_Wolf_impl.listeners[0]!, {
      state,
      player,
      space: state.actionSpaces[0],
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok' },
      transactionEvents: [moved()],
    } as never)

    expect(result?.flow).toBeDefined()
    expect(result?.sourceCard).toBe(CARD_ID)
  })

  it('ignores non-matching resource moves even when result claims the top resource', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.id = 'p1'

    const result = executeCardListener(E103_Wolf_impl.listeners[0]!, {
      state,
      player,
      space: state.actionSpaces[0],
      actionId: 'gain',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { grain: 1 } },
      transactionEvents: [moved({ resources: { clay: 1 } })],
    } as never)

    expect(result).toBeUndefined()
  })
})
