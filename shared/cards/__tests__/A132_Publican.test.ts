import { describe, expect, it } from 'vitest'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import { makeBlankPlayer } from '../../domain/__tests__/helpers'
import { A132_Publican_impl } from '../A/A132_Publican'

describe('A132_Publican', () => {
  it('does not offer grain when the opponent cannot sow independently', () => {
    const sower = makeBlankPlayer({
      id: 'sower',
      resources: { grain: 0, vegetable: 0 },
      fields: [{ row: 0, col: 0, stacks: [] }],
    }) as unknown as PlayerState
    const owner = makeBlankPlayer({
      id: 'owner',
      resources: { grain: 1 },
      occupationPlayed: ['A132_Publican'],
    }) as unknown as PlayerState
    const listener = A132_Publican_impl.listeners[0]!

    const result = listener.handler!({
      state: { players: [sower, owner] } as unknown as GameState,
      player: sower,
      triggerPlayer: sower,
      ownerPlayer: owner,
      space: { id: 'grain-utilization' } as ActionSpace,
      actionId: 'sow',
      phase: 'before',
      actionContext: { checkedReplaceAction: true },
    } as CardListenerContext)

    expect(result).toBeUndefined()
  })
})
