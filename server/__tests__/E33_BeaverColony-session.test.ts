import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import { E033_BeaverColony_impl } from '../../shared/cards/E/E033_BeaverColony'
import type { DraftGameEvent } from '../../shared/contract/events'

import '../../shared/cards/E/E033_BeaverColony'

const CARD_ID = 'E033_BeaverColony'
const AFTER_COLLECT = E033_BeaverColony_impl.listeners.find((listener) => listener.id === 'E33-beaver-colony-after-collect')!
const AFTER_GAIN = E033_BeaverColony_impl.listeners.find((listener) => listener.id === 'E33-beaver-colony-after-gain')!

const moved = (
  overrides: Partial<DraftGameEvent<'resource.moved'>> = {},
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources: { reed: 1 },
  from: { kind: 'actionSpace', spaceId: 'reed-bank' },
  to: { kind: 'player', playerId: 'p1' },
  reason: 'collect',
  ...overrides,
})

const directContext = (
  actionId: 'collect' | 'gain',
  transactionEvents: DraftGameEvent<'resource.moved'>[],
  actionEvents = transactionEvents,
): CardListenerContext => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  const player = state.players[0]!
  player.id = 'p1'
  player.minorPlayed.push(CARD_ID)
  return {
    state,
    player,
    space: state.actionSpaces.find((space) => space.id === 'reed-bank')!,
    actionId,
    phase: 'immediatelyAfter',
    transactionEvents,
    actionEvents,
    result: { type: 'ok', resourcesGained: { reed: 1 } },
  } as unknown as CardListenerContext
}

describe('E033_BeaverColony session', () => {
  it('grants bonus VP for reed collected from an action space without result gains', () => {
    const ctx = directContext('collect', [moved()])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(AFTER_COLLECT, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'bonus-vp',
      params: { score: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('grants bonus VP for gain action reed from a reed action space without result gains', () => {
    const ctx = directContext('gain', [moved({ reason: 'gain' })])
    ctx.result = { type: 'ok' }

    const result = executeCardListener(AFTER_GAIN, ctx)

    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'bonus-vp',
      params: { score: 1 },
      sourceCard: CARD_ID,
    })
  })

  it('does not trigger for non-reed events even when result reports reed', () => {
    const ctx = directContext('collect', [moved({ resources: { wood: 1 } })])

    const result = executeCardListener(AFTER_COLLECT, ctx)

    expect(result).toBeUndefined()
  })

  it('does not trigger without a current reed event', () => {
    const ctx = directContext('collect', [])

    const result = executeCardListener(AFTER_COLLECT, ctx)

    expect(result).toBeUndefined()
  })

  it('ignores stale transaction reed when actionEvents has no current reed', () => {
    const ctx = directContext('collect', [moved()], [moved({ resources: { wood: 1 } })])

    const result = executeCardListener(AFTER_COLLECT, ctx)

    expect(result).toBeUndefined()
  })
})
