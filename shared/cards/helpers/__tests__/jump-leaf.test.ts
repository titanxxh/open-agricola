import { describe, it, expect } from 'vitest'
import { jumpLeaf, isJumpChainContains } from '../jump-leaf'
import type { CardListenerContext } from '../../card-listeners'

describe('jumpLeaf', () => {
  it('builds a place-farmer leaf with viaCardJump actionContext', () => {
    const flow = jumpLeaf({
      sourceCard: 'B130_FullPeasant',
      workerId: '1',
      targetSpaceId: 'fencing',
    })
    expect(flow).toEqual({
      type: 'leaf',
      actionId: 'place-farmer',
      sourceCard: 'B130_FullPeasant',
      actionContext: {
        viaCardJump: true,
        sourceCard: 'B130_FullPeasant',
        workerId: '1',
        targetSpaceId: 'fencing',
      },
    })
  })
})

describe('isJumpChainContains', () => {
  const makeContext = (jumpChain?: unknown): CardListenerContext =>
    ({ actionContext: jumpChain === undefined ? undefined : { jumpChain } } as unknown as CardListenerContext)

  it('returns false when actionContext is missing', () => {
    expect(isJumpChainContains(makeContext(), 'A129_Swagman')).toBe(false)
  })

  it('returns false when jumpChain is undefined', () => {
    expect(isJumpChainContains(
      ({ actionContext: {} } as unknown as CardListenerContext),
      'A129_Swagman',
    )).toBe(false)
  })

  it('returns false when jumpChain is empty', () => {
    expect(isJumpChainContains(makeContext([]), 'A129_Swagman')).toBe(false)
  })

  it('returns true when cardId is in jumpChain', () => {
    expect(isJumpChainContains(
      makeContext(['A129_Swagman', 'B130_FullPeasant']),
      'A129_Swagman',
    )).toBe(true)
  })

  it('returns false when cardId is not in jumpChain', () => {
    expect(isJumpChainContains(
      makeContext(['A129_Swagman']),
      'B130_FullPeasant',
    )).toBe(false)
  })

  it('returns false when jumpChain is not an array (defensive)', () => {
    expect(isJumpChainContains(
      makeContext('A129_Swagman'),
      'A129_Swagman',
    )).toBe(false)
  })
})
