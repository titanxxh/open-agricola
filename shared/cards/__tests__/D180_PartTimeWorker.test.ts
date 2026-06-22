import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import type { ActionHookPhase } from '../../actions/hooks'
import type { DraftGameEvent } from '../../contract/events'
import type { Resource } from '../../contract/types'
import { D180_PartTimeWorker_impl } from '../D/D180_PartTimeWorker'
import type { CardListenerContext } from '../card-listeners'

const CARD_ID = 'D180_PartTimeWorker'

const moved = (
  resources: Partial<Resource>,
  playerId: string,
  spaceId = 'forest',
): DraftGameEvent<'resource.moved'> => ({
  type: 'resource.moved',
  resources,
  from: { kind: 'actionSpace', spaceId },
  to: { kind: 'player', playerId },
  reason: 'collect',
})

const setupContext = (resources: Partial<Resource>, options: {
  spaceId?: string
  gainPerRound?: Partial<Resource>
  extraEvents?: DraftGameEvent<'resource.moved'>[]
  transactionExtraEvents?: DraftGameEvent<'resource.moved'>[]
} = {}): CardListenerContext => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  const spaceId = options.spaceId ?? 'forest'
  const space = state.actionSpaces.find((candidate) => candidate.id === spaceId)!
  space.gainPerRound = options.gainPerRound ?? { wood: 1 }
  const events = [moved(resources, player.id, spaceId), ...(options.extraEvents ?? [])]
  const transactionEvents = [...events, ...(options.transactionExtraEvents ?? [])]
  return {
    state,
    player,
    ownerPlayer: player,
    triggerPlayer: player,
    effectPlayer: player,
    space,
    actionId: 'collect',
    phase: 'after' as ActionHookPhase,
    result: { type: 'ok', resourcesGained: resources },
    transactionEvents,
    actionEvents: events,
  } as CardListenerContext
}

const run = (context: CardListenerContext) =>
  D180_PartTimeWorker_impl.listeners[0]!.handler!(context)

describe('D180 Part-Time Worker listener', () => {
  it('uses the return-to-space plus gain shape for a single-resource exact total', () => {
    expect(run(setupContext({ wood: 2 }))).toMatchObject({
      sourceCard: CARD_ID,
      flow: {
        type: 'seq',
        optional: true,
        children: [
          {
            actionId: 'return-to-space',
            params: { wood: 1 },
            sourceCard: CARD_ID,
            actionContext: { targetSpaceId: 'forest' },
          },
          { actionId: 'gain', params: { sheep: 1 }, sourceCard: CARD_ID },
        ],
      },
    })
  })

  it('enumerates mixed-resource return maps for exact four goods', () => {
    const result = run(setupContext({ wood: 2, clay: 2 }))
    expect(result).toMatchObject({ sourceCard: CARD_ID, flow: { type: 'xor', optional: true } })
    const flow = result!.flow
    if (!flow || flow.type !== 'xor') return
    const costs = flow.children.map((child) => {
      expect(child.type).toBe('seq')
      if (child.type !== 'seq') return {}
      expect(child.children[0]!.actionContext).toEqual({ targetSpaceId: 'forest' })
      return child.children[0]!.params
    })
    expect(costs).toEqual([
      { clay: 2 },
      { wood: 1, clay: 1 },
      { wood: 2 },
    ])
    expect(flow.children).toHaveLength(3)
  })

  it('does not trigger for other totals, non-accumulation spaces, or stale later events', () => {
    expect(run(setupContext({ wood: 3 }))).toBeUndefined()
    expect(run(setupContext({ wood: 2 }, { gainPerRound: {} }))).toBeUndefined()
    expect(run(setupContext({ wood: 1 }, {
      transactionExtraEvents: [moved({ wood: 1 }, 'p1', 'forest')],
    }))).toBeUndefined()
  })
})
