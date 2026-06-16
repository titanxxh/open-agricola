import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener } from '../../shared/cards/card-listeners'
import { A17_ReclamationPlow_impl } from '../../shared/cards/A/A17_ReclamationPlow'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionExecutionResult } from '../../shared/contract/types'

import '../../shared/cards/A/A17_ReclamationPlow'
import '../../shared/cards/A/A137_RiverineShepherd'

const CARD_ID = 'A17_ReclamationPlow'
const A137_ID = 'A137_RiverineShepherd'
const LISTENER = A17_ReclamationPlow_impl.listeners[0]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { sheep: 1 },
  from: { kind: 'actionSpace', spaceId: 'sheep-market' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const setupDirectContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  result?: ActionExecutionResult,
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  player.houseAnimalType = 'sheep'
  player.houseAnimalCount = 1
  const space = {
    id: 'sheep-market',
    gainPerRound: { sheep: 1 },
  }

  return {
    state,
    player,
    space,
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    result,
  } as unknown as CardListenerContext
}

describe('A17_ReclamationPlow session', () => {
  it('keeps the session collect path and prompts after animal reorg', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])

    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionReclamationPlow')
  })

  it('uses action-space resource.moved events even when result has no resourcesGained', () => {
    const ctx = setupDirectContext([moved()], { type: 'ok' })

    const result = executeCardListener(LISTENER, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'plow',
      sourceCard: CARD_ID,
      optional: true,
    })
  })

  it('ignores non-action-space animal moves even when result claims sheep gained', () => {
    const ctx = setupDirectContext([
      moved({ from: { kind: 'supply' } }),
    ], { type: 'ok', resourcesGained: { sheep: 1 } })

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not read prior global state events when current transaction has no animal moves', () => {
    const ctx = setupDirectContext([], { type: 'ok', resourcesGained: { sheep: 1 } })
    ctx.state.events = [
      { type: 'worker.placed', actorPlayerId: 'p1', workerId: 'w1', spaceId: 'sheep-market' } as never,
      moved() as never,
    ]

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger from A137 feasibility on a non-animal Reed Bank action', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(A137_ID)
    player.pastures = [
      {
        id: 'p1',
        size: 4,
        tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }, { row: 1, col: 0 }, { row: 1, col: 1 }],
        stables: 0,
        animalType: null,
        animalCount: 0,
      },
    ]

    const reedBank = state.actionSpaces.find((space) => space.id === 'reed-bank')!
    reedBank.resources.reed = 2
    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')!
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'reed-bank')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')

    if (resp.interaction.stateId === 'wait') {
      const skip = resp.interaction.options?.find((option) => option.value === '__skip__')
      if (skip) resp = session.resolveChoice(0, skip.value)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .not.toBe('ui.interactionReclamationPlow')
    expect(resp.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBeFalsy()
  })
})
