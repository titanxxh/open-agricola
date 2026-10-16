import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../session/state-bootstrap'
import { claimFarmyardGoodsTokens, hasClaimableFarmyardGoodsTokens } from '../farmyard-space-token-claims'

function setup() {
  const player = createInitialState(42, { playerCount: 2 }).players[0]!
  player.farmyardSpaceStates = [
    { spaceKey: '0-2', sourceCardId: 'one', kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' },
    { spaceKey: '1-2', sourceCardId: 'one', kind: 'farmyard-goods-token', resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused' },
    { spaceKey: '0-2', sourceCardId: 'other', kind: 'farmyard-goods-token', resources: { food: 1 }, claimPolicy: 'when-no-longer-unused' },
  ]
  return player
}

describe('source-owned farmyard goods claims', () => {
  it('claims only the committed host coordinates even after later geometry changes', () => {
    const player = setup()
    expect(hasClaimableFarmyardGoodsTokens(player, 'one', [{ row: 0, col: 2 }])).toBe(true)
    expect(claimFarmyardGoodsTokens(player, 'one', [{ row: 0, col: 2 }, { row: 0, col: 2 }])).toEqual({ clay: 1 })
    expect(player.resources.clay).toBe(1)
    expect(player.farmyardSpaceStates?.map(token => [token.sourceCardId, token.spaceKey])).toEqual([['one', '1-2'], ['other', '0-2']])
    expect(claimFarmyardGoodsTokens(player, 'one', [{ row: 0, col: 2 }])).toEqual({})
  })

  it('never restores a nested consumed token or sweeps an unrelated used space', () => {
    const player = setup()
    const outer = [{ row: 0, col: 2 }, { row: 1, col: 2 }]
    expect(claimFarmyardGoodsTokens(player, 'one', [{ row: 1, col: 2 }])).toEqual({ clay: 1 })
    expect(claimFarmyardGoodsTokens(player, 'one', outer)).toEqual({ clay: 1 })
    expect(player.resources.clay).toBe(2)
    expect(player.farmyardSpaceStates).toHaveLength(1)
  })

  it('preserves live-used default claims and treats an explicit empty scope as none', () => {
    const player = setup()
    player.fields = [{ row: 0, col: 2, stacks: [] }]
    expect(hasClaimableFarmyardGoodsTokens(player, 'one', [])).toBe(false)
    expect(claimFarmyardGoodsTokens(player, 'one', [])).toEqual({})
    expect(hasClaimableFarmyardGoodsTokens(player, 'one')).toBe(true)
    expect(claimFarmyardGoodsTokens(player, 'one')).toEqual({ clay: 1 })
    expect(player.farmyardSpaceStates).toHaveLength(2)
    expect(hasClaimableFarmyardGoodsTokens(player, 'one')).toBe(false)
  })
})
