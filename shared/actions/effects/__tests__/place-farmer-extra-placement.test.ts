import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../../server/game/authoritative-session'
import type { ActionExecutionContext, ActionSpace } from '../../../contract/types'
import { setWorkersAtHome } from '../../../domain/player'
import { createInitialPlayerStats } from '../../../session/stats'
import { placeFarmerAction } from '../place-farmer'

const makeCtx = (actionContext: Record<string, unknown> = {}): ActionExecutionContext => {
  const session = new GameSession(undefined, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 14
  state.actionSpaces = state.actionSpaces.filter((space) =>
    ['forest', 'sheep-market', 'farmland'].includes(space.id),
  )
  for (const space of state.actionSpaces) {
    space.takenBy = []
  }
  const farmland = state.actionSpaces.find((space) => space.id === 'farmland')!
  farmland.execute = () => ({
    type: 'flow' as const,
    flow: { type: 'leaf' as const, actionId: 'plow' },
  })

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.stats = createInitialPlayerStats({ isFirstPlayer: true })

  return {
    state,
    player,
    space: state.actionSpaces[0] as ActionSpace,
    actionContext,
  } as ActionExecutionContext
}

describe('place-farmer extra placement', () => {
  it('filters extra placement choices by actionContext.constraints', () => {
    const result = placeFarmerAction.execute(makeCtx({ constraints: ['sheep-market'] }))
    expect(result.type).toBe('request')
    if (result.type !== 'request' || result.request.kind !== 'choice') return
    expect(result.request.options.map((option) => option.value)).toEqual(['sheep-market'])
  })

  it('rejects resolving a target outside actionContext.constraints', () => {
    const result = placeFarmerAction.resolveChoice!(makeCtx({ constraints: ['sheep-market'] }), 'forest')
    expect(result).toMatchObject({ type: 'fail', errorKey: 'log.placeFarmerFail' })
  })

  it('returns target action flow after placing the extra worker', () => {
    const result = placeFarmerAction.resolveChoice!(makeCtx({ constraints: ['farmland'] }), 'farmland')
    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow).toMatchObject({
      type: 'leaf',
      actionId: 'farmland',
      expandFlow: true,
    })
  })

  it('rejects a target that is no longer in the allowed placement set', () => {
    const ctx = makeCtx()
    const forest = ctx.state.actionSpaces.find((space) => space.id === 'forest')!
    forest.takenBy = [{ playerId: ctx.state.players[1]!.id, workerId: '1' }]

    const result = placeFarmerAction.resolveChoice!(ctx, 'forest')

    expect(result).toMatchObject({ type: 'fail', errorKey: 'log.placeFarmerFail' })
  })

  it('rejects a target that is not open yet', () => {
    const ctx = makeCtx()
    const forest = ctx.state.actionSpaces.find((space) => space.id === 'forest')!
    forest.roundAvailable = 15

    const result = placeFarmerAction.resolveChoice!(ctx, 'forest')

    expect(result).toMatchObject({ type: 'fail', errorKey: 'log.placeFarmerFail' })
  })
})
