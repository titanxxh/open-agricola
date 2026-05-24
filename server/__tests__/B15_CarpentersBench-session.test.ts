import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { B15_CarpentersBench_impl } from '../../shared/cards/B/B15_CarpentersBench'
import type { DraftGameEvent } from '../../shared/contract/events'
import type { ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/B/B15_CarpentersBench'

const CARD_ID = 'B15_CarpentersBench'
const LISTENER = B15_CarpentersBench_impl.listeners[0]!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { wood: 3 },
  from: { kind: 'actionSpace', spaceId: 'forest' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const directContext = (
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  actionEvents = transactionEvents,
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  return {
    state,
    player,
    space: { id: 'forest', gainPerRound: { wood: 1 } },
    actionId: 'collect',
    phase: 'after',
    transactionEvents,
    actionEvents,
    result: { type: 'ok', resourcesGained: { wood: 3 } },
  } as unknown as CardListenerContext
}

const fenceLeaf = (flow: ActionFlow | undefined) => {
  if (flow?.type !== 'seq') return undefined
  return flow.children.find((child) => child.type === 'leaf' && child.actionId === 'fence')
}

describe('B15_CarpentersBench session', () => {
  it('opens fence option with benchWood from action-space wood events', () => {
    const ctx = directContext([moved()])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(LISTENER, ctx)

    expect(fenceLeaf(result?.flow)).toMatchObject({
      actionId: 'fence',
      actionContext: {
        trueAction: false,
        fencePolicy: {
          allowedSegmentTypes: ['fence'],
          segmentBounds: { total: { min: 1, max: 4 } },
          newPastureBounds: { count: { min: 1, max: 1 } },
          costPolicy: { fence: { wood: 1 } },
          cancelPolicy: 'forbidCancel',
        },
      },
    })
  })

  it('does not trigger for supply/cardEffect wood even when result reports wood', () => {
    const ctx = directContext([moved({
      from: { kind: 'supply' },
      reason: 'cardEffect',
    })])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger without a current wood event', () => {
    const ctx = directContext([])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction wood when actionEvents has no current wood', () => {
    const ctx = directContext([moved()], [])

    const result = executeCardListener(LISTENER, ctx)

    expect(result).toBeUndefined()
  })
})
