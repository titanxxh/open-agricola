import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import type { ActionExecutionContext, ActionSpace } from '../../../contract/types'
import { setWorkersAtHome, workersAvailable } from '../../../domain/player'
import { createInitialPlayerStats } from '../../../session/stats'
import { placeFarmerOnSpaceAction } from '../internal/place-farmer-on-space'

const makeCtx = (params: Record<string, unknown>): ActionExecutionContext => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1
  state.actionSpaces = state.actionSpaces.filter((space) =>
    ['resource-market-4', 'farmland'].includes(space.id),
  )
  const player = state.players[0]!
  const other = state.players[1]!
  setWorkersAtHome(state, player, 2)
  player.stats = createInitialPlayerStats({ isFirstPlayer: true })
  const market = state.actionSpaces.find((space) => space.id === 'resource-market-4')!
  market.takenBy = [{ playerId: other.id, workerId: '1' }]
  return {
    state,
    player,
    space: state.actionSpaces[0] as ActionSpace,
    params,
    sourceCard: 'B178_TagAlong',
  } as ActionExecutionContext
}

describe('place-farmer-on-space internal action', () => {
  it('places an at-home worker onto an occupied target only when allowOccupied is true', () => {
    const blocked = placeFarmerOnSpaceAction.execute(makeCtx({
      spaceId: 'resource-market-4',
      sourceCard: 'B178_TagAlong',
    }))
    expect(blocked).toMatchObject({ type: 'fail', errorKey: 'log.placeFarmerFail' })

    const ctx = makeCtx({
      spaceId: 'resource-market-4',
      allowOccupied: true,
      sourceCard: 'B178_TagAlong',
    })
    const result = placeFarmerOnSpaceAction.execute(ctx)

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow).toMatchObject({
      type: 'leaf',
      actionId: 'resource-market-4',
      expandFlow: true,
      sourceCard: 'B178_TagAlong',
    })
    expect(workersAvailable(ctx.state, ctx.player)).toBe(1)
    expect(ctx.state.actionSpaces.find((space) => space.id === 'resource-market-4')?.takenBy).toEqual([
      { playerId: ctx.state.players[1]!.id, workerId: '1' },
      { playerId: ctx.player.id, workerId: '1' },
    ])
    expect(ctx.player.stats?.placedFarmers).toBe(1)
  })

  it('does not bypass blocked, unavailable, executable, or worker-supply checks', () => {
    for (const mutate of [
      (space: ActionSpace) => { space.blockedBy = [{ playerId: 'p2', workerId: '1', sourceSpaceId: 'linked' }] },
      (space: ActionSpace) => { space.roundAvailable = 2 },
      (space: ActionSpace) => { space.canBeExecutedByPlayer = () => false },
      (_space: ActionSpace, ctx: ActionExecutionContext) => { setWorkersAtHome(ctx.state, ctx.player, 0) },
    ]) {
      const ctx = makeCtx({
        spaceId: 'resource-market-4',
        allowOccupied: true,
        sourceCard: 'B178_TagAlong',
      })
      const market = ctx.state.actionSpaces.find((space) => space.id === 'resource-market-4')!
      mutate(market, ctx)

      const result = placeFarmerOnSpaceAction.execute(ctx)

      expect(result).toMatchObject({ type: 'fail', errorKey: 'log.placeFarmerFail' })
      expect(market.takenBy).toEqual([{ playerId: ctx.state.players[1]!.id, workerId: '1' }])
    }
  })
})
