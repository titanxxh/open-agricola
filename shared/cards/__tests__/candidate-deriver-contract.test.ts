import { describe, expect, it } from 'vitest'
import { executeCardListener, type CardListenerRegistration } from '../card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../contract/types'

const player = { id: 'p1' } as PlayerState
const state = { players: [player] } as GameState
const space = {} as ActionSpace

describe('candidateDerivers contract', () => {
  it('throws when a non-computeCosts card listener returns candidateDerivers', () => {
    const listener: CardListenerRegistration = {
      id: 'bad-candidate-deriver-phase',
      phases: ['after'],
      handler: () => ({
        candidateDerivers: [{
          id: 'BadPhase:deriver',
          sourceCardId: 'BadPhase',
          derive: () => [],
        }],
      }),
    }

    expect(() =>
      executeCardListener(listener, {
        state,
        player,
        space,
        actionId: 'improvement',
        phase: 'after',
      }),
    ).toThrow(/candidateDeriver.*phase=after.*phase=computeCosts/)
  })
})
