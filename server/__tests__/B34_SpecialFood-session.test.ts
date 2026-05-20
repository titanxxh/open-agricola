import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import {
  executeCardListener,
  getRegisteredCardListeners,
  type CardListenerContext,
} from '../../shared/cards/card-listeners'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow, Resource } from '../../shared/contract/types'
import { writeCardExtraData } from '../../shared/cards/helpers/card-state'

import '../../shared/cards/B/B34_SpecialFood'

const CARD_ID = 'B34_SpecialFood'

const findListener = () =>
  getRegisteredCardListeners().find((listener) => listener.id === 'B34-special-food-after-collect')

const moved = (
  resources: Partial<Resource>,
  playerId: string,
  from: DraftGameEvent<'resource.moved'>['from'] = { kind: 'actionSpace', spaceId: 'sheep-market' },
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from,
  to: { kind: 'player', playerId },
  reason: from.kind === 'actionSpace' ? 'collect' : 'cardEffect',
})

const setup = () => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.pastures = [{
    id: 'p1',
    size: 2,
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    stables: 0,
    animalType: 'sheep',
    animalCount: 1,
  }]
  writeCardExtraData(player, CARD_ID, 'animalsBeforeCollecting', {
    sheep: 0,
    boar: 0,
    cattle: 0,
  })
  const space = state.actionSpaces.find((entry) => entry.id === 'sheep-market')!
  return { state, player, space }
}

const runListener = (
  events: readonly DraftGameEvent<'resource.moved'>[],
  resourcesGained?: Partial<Resource>,
  actionEvents: readonly DraftGameEvent<'resource.moved'>[] = events,
): ActionFlow | undefined => {
  const listener = findListener()
  expect(listener).toBeDefined()
  const { state, player, space } = setup()
  return executeCardListener(listener!, {
    state,
    player,
    triggerPlayer: player,
    ownerPlayer: player,
    space,
    actionId: 'collect',
    phase: 'after',
    result: resourcesGained ? { type: 'ok', resourcesGained } : { type: 'ok' },
    transactionEvents: events,
    actionEvents,
  } as unknown as CardListenerContext)?.flow
}

describe('B34_SpecialFood action-space provenance', () => {
  it('awards bonus VP for animals moved from an action space to the trigger player', () => {
    const { player } = setup()
    const events = [moved({ sheep: 1 }, player.id)]
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'resource.moved',
        from: expect.objectContaining({ kind: 'actionSpace' }),
        to: expect.objectContaining({ kind: 'player', playerId: player.id }),
      }),
    ]))
    const flow = runListener(events)

    expect(flow?.type).toBe('seq')
    if (flow?.type !== 'seq') throw new Error('expected sequence flow')
    expect(flow.children.filter((child) => child.type === 'leaf' && child.actionId === 'bonus-vp')).toHaveLength(1)
  })

  it('does not award bonus VP for animals moved from supply or a card', () => {
    const { player } = setup()

    expect(runListener([moved({ sheep: 1 }, player.id, { kind: 'supply' })], { sheep: 1 })).toBeUndefined()
    expect(runListener([moved({ sheep: 1 }, player.id, { kind: 'card', playerId: player.id, cardId: 'Test_Source' })], { sheep: 1 })).toBeUndefined()
  })

  it('ignores stale earlier transaction animal events when current actionEvents has no animal move', () => {
    const { player } = setup()
    const stale = moved({ sheep: 1 }, player.id)

    expect(runListener([stale], undefined, [])).toBeUndefined()
  })
})
