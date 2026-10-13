import { describe, expect, it } from 'vitest'
import { createInitialState } from '../../../session/state-bootstrap'
import { selectionAction } from '../internal/selection'
import { getFarmyardTilePositions, positionKey } from '../../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../../domain/farmyard-usage'
import { buildLivePlaceTerrainFlow, buildPlaceTerrainFlow } from '../../../moor/terrain-flow'

// The public selection effect is the mechanical seam: initially unavailable
// terrain placements become legal when another reaction frees a farmyard tile.
const setup = () => {
  const state = createInitialState(4242, { playerCount: 2, enableFarmersOfTheMoor: true, allowIncompleteMoorMinorPool: true })
  const player = state.players[0]!
  player.farmTerrain = []
  const used = getUsedFarmyardTileKeys(player)
  const available = getFarmyardTilePositions(player).filter(tile => !used.has(positionKey(tile)))
  player.farmTerrain = [{ ...available[0]!, kind: 'moor' }]
  player.fields = available.slice(1).map(tile => ({ ...tile, stacks: [] }))
  const flow = buildLivePlaceTerrainFlow('M045_TreeNursery', 'forest')
  if (flow.type !== 'leaf') throw new Error('Expected a terrain selection leaf')
  return { state, player, sourceCard: flow.sourceCard, actionContext: flow.actionContext }
}

describe('live scheduled terrain selection', () => {
  it('builds and commits terrain placement from current unused tiles', () => {
    const context = setup()
    expect(buildPlaceTerrainFlow('M045_TreeNursery', context.player, 'forest')).toBeUndefined()
    expect(selectionAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(false)
    context.player.farmTerrain = []
    expect(selectionAction.canBeExecutedByPlayer(context.state, context.player, context)).toBe(true)
    const result = selectionAction.execute(context)
    expect(result.type).toBe('request')
    if (result.type !== 'request' || result.request.kind !== 'selection'
      || result.request.selection.kind !== 'farm-position') throw new Error('Expected live farm selection')
    expect(result.request.selection.selectablePositions).toEqual([{ row: 0, col: 0 }])
    const committed = selectionAction.resolveChoice!(context, 'confirm', { positions: ['0-0'] })
    expect(committed.type).toBe('ok')
    expect(context.player.farmTerrain).toEqual([{ row: 0, col: 0, kind: 'forest' }])
  })

  it('rejects a position occupied after the request without consuming terrain', () => {
    const context = setup()
    context.player.farmTerrain = []
    expect(selectionAction.execute(context).type).toBe('request')
    context.player.fields.push({ row: 0, col: 0, stacks: [] })
    const rejected = selectionAction.resolveChoice!(context, 'confirm', { positions: ['0-0'] })
    expect(rejected.type).toBe('fail')
    expect(context.player.farmTerrain).toEqual([])
  })
})
