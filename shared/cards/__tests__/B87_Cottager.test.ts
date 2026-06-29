import { describe, expect, it } from 'vitest'
import { B087_Cottager_impl } from '../B/B087_Cottager'
import type { ActionHookPhase } from '../../actions/hooks'
import type { CardListenerContext } from '../card-listeners'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'

const CARD_ID = 'B087_Cottager'

describe('B087_Cottager', () => {
  it('marks only the construct child as trueAction=false', () => {
    const player = { id: 'p1', occupationPlayed: [CARD_ID] } as unknown as PlayerState
    const state = { players: [player] } as unknown as GameState

    const result = B087_Cottager_impl.listeners[0]!.handler({
      state,
      player,
      actionId: 'place-farmer',
      phase: 'after' as ActionHookPhase,
      space: { id: 'day-laborer' },
    } as unknown as CardListenerContext)

    const flow = result!.flow as Extract<ActionFlow, { type: 'xor' }>
    const construct = flow.children[0] as Extract<ActionFlow, { type: 'leaf' }>
    const renovation = flow.children[1] as Extract<ActionFlow, { type: 'leaf' }>

    expect(result?.sourceCard).toBe(CARD_ID)
    expect(construct.actionId).toBe('construct')
    expect(construct.actionContext).toEqual({ max: 1, trueAction: false })
    expect(renovation.actionId).toBe('renovate-house')
    expect(renovation.actionContext).toBeUndefined()
  })
})
