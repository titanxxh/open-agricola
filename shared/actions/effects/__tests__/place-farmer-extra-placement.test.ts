import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession } from '../../../../server/game/authoritative-session'
import { createWorkSession } from '../../../../server/__tests__/_helpers/session-fixtures'
import type { ActionExecutionContext } from '../../../contract/types'
import { setWorkersAtHome } from '../../../domain/player'
import { createInitialPlayerStats } from '../../../session/stats'
import { placeFarmerAction } from '../place-farmer'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const makeCtx = (
  actionContext: Record<string, unknown> = {},
  seed = 42,
  sheep = 1,
): ActionExecutionContext => {
  const session = createWorkSession({ seed, configure(state) {
    state.currentPlayerIndex = 0
    state.round = 14
    for (const space of state.actionSpaces) space.takenBy = []
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = sheep
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.stats = createInitialPlayerStats({ isFirstPlayer: true })
  } })
  sessions.push(session)
  const state = session.getState().state
  state.actionSpaces = state.actionSpaces.filter(space =>
    ['forest', 'sheep-market', 'farmland'].includes(space.id))
  const player = state.players[0]!
  return {
    state,
    player,
    space: state.actionSpaces.find(space => space.id === 'forest')!,
    actionContext,
  }
}

describe('place-farmer extra placement', () => {
  it.each([1, 42, 9707])('filters extra placement choices by constraints with seed %s', seed => {
    const ctx = makeCtx({}, seed)
    const unconstrained = placeFarmerAction.execute(ctx)
    expect(unconstrained.type).toBe('request')
    if (unconstrained.type !== 'request' || unconstrained.request.kind !== 'choice') throw new Error('Expected placement options')
    expect(unconstrained.request.options.map(option => option.value).sort()).toEqual(['farmland', 'forest', 'sheep-market'])

    ctx.actionContext = { constraints: ['sheep-market'] }
    const result = placeFarmerAction.execute(ctx)
    expect(result.type).toBe('request')
    if (result.type !== 'request' || result.request.kind !== 'choice') throw new Error('Expected constrained placement options')
    expect(result.request.options.map((option) => option.value)).toEqual(['sheep-market'])
  })

  it.each([1, 42, 9707])('rejects an empty constrained target despite other legal spaces with seed %s', seed => {
    const ctx = makeCtx({}, seed, 0)
    const unconstrained = placeFarmerAction.execute(ctx)
    expect(unconstrained.type).toBe('request')
    if (unconstrained.type !== 'request' || unconstrained.request.kind !== 'choice') throw new Error('Expected placement options')
    expect(unconstrained.request.options.map(option => option.value).sort()).toEqual(['farmland', 'forest'])

    ctx.actionContext = { constraints: ['sheep-market'] }
    const result = placeFarmerAction.execute(ctx)
    expect(result).toMatchObject({ type: 'fail', errorKey: 'log.placeFarmerFail' })
    expect(ctx.state.actionSpaces.every(space => space.takenBy.length === 0)).toBe(true)
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
