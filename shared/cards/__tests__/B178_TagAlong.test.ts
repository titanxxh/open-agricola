import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerContext } from '../card-listeners'
import type { ActionSpace } from '../../contract/types'
import { B178_TagAlong_impl } from '../B/B178_TagAlong'

const CARD_ID = 'B178_TagAlong'

const contextFor = (spaceId: string): CardListenerContext => {
  const session = new GameSession(42, undefined, { playerCount: 5 })
  const state = session.getState().state
  state.round = 1
  const owner = state.players[0]!
  const trigger = state.players[1]!
  const space: ActionSpace = {
    id: spaceId,
    nameKey: `actions.${spaceId}.name`,
    descriptionKey: `actions.${spaceId}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    resources: { ...owner.resources },
    takenBy: [{ playerId: trigger.id, workerId: '1' }],
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
  }
  state.actionSpaces = [space]
  return {
    state,
    player: trigger,
    triggerPlayer: trigger,
    ownerPlayer: owner,
    effectPlayer: owner,
    space,
    actionId: 'place-farmer',
    phase: 'after' as ActionHookPhase,
    result: { type: 'ok' },
  } as CardListenerContext
}

describe('B178 Tag-Along listener', () => {
  it('recognizes every Resource Market variant', () => {
    for (const spaceId of ['resource-market', 'resource-market-4', 'resource-market-56']) {
      const result = B178_TagAlong_impl.listeners[0]!.handler!(contextFor(spaceId))
      expect(result).toMatchObject({
        sourceCard: CARD_ID,
        flow: {
          type: 'leaf',
          actionId: 'place-farmer-on-space',
          optional: true,
          sourceCard: CARD_ID,
          params: {
            spaceId,
            allowOccupied: true,
            sourceCard: CARD_ID,
          },
        },
      })
    }
  })
})
