import { describe, expect, it } from 'vitest'
import type { CardListenerContext } from '../card-listeners'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { C130_OutskirtsDirector_impl } from '../C/C130_OutskirtsDirector'

const handler = C130_OutskirtsDirector_impl.listeners[0]!.handler!

// The board's grove / hollow spaces, in board order; the placement lands on `placedOn`.
const reedTarget = (spaceIds: string[], placedOn: string): string | undefined => {
  const player = { id: 'p1', workers: [] } as unknown as PlayerState
  const state = { players: [player], actionSpaces: spaceIds.map((id) => ({ id, takenBy: [] })) } as unknown as GameState
  const result = handler({ state, player, space: { id: placedOn } } as unknown as CardListenerContext)
  const flow = result && 'flow' in result ? result.flow as Extract<ActionFlow, { type: 'seq' }> : undefined
  const leaf = flow?.children[0] as Extract<ActionFlow, { type: 'leaf' }> | undefined
  return leaf?.params?.spaceId as string | undefined
}

describe('C130 Outskirts Director pairs grove and hollow across board variants', () => {
  it('pairs the base spaces on a 1-3 player board', () => {
    expect(reedTarget(['grove', 'hollow'], 'grove')).toBe('hollow')
    expect(reedTarget(['grove', 'hollow'], 'hollow')).toBe('grove')
  })

  it('treats the 4-player hollow as a hollow', () => {
    expect(reedTarget(['grove', 'hollow-4'], 'hollow-4')).toBe('grove')
    expect(reedTarget(['grove', 'hollow-4'], 'grove')).toBe('hollow-4')
  })

  it('treats the 5/6-player grove and hollow as their base spaces', () => {
    expect(reedTarget(['grove-56', 'hollow-56'], 'grove-56')).toBe('hollow-56')
    expect(reedTarget(['grove-56', 'hollow-56'], 'hollow-56')).toBe('grove-56')
  })

  it('ignores other spaces and variants that are not on the board', () => {
    expect(reedTarget(['grove', 'hollow'], 'lessons')).toBeUndefined()
    expect(reedTarget(['grove'], 'hollow-56')).toBeUndefined()
  })
})
