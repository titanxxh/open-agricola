import { describe, expect, it } from 'vitest'
import './setup-register-all'
import { GameSession } from '../../../server/game/authoritative-session'
import { createPlayerActionSpaces, getPlayerActionSpaceConfig } from '../player-action-space'
import type { ActionExecutionContext, ActionFlow } from '../../contract/types'
import '../B/B171_GreenhouseBuilder'
import '../D/D170_FoldBuilder'

const setupSession = (cardId: string, playerCount = 5) => {
  const session = new GameSession(42, undefined, { playerCount })
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  })
  state.players[0]!.occupationPlayed = [cardId]
  session.loadState(state)
  return session
}

const leafActionIds = (flow: ActionFlow): string[] => {
  if (flow.type === 'leaf') return [flow.actionId]
  if ('children' in flow) return flow.children.flatMap(leafActionIds)
  return []
}

describe('5+ player action space occupations', () => {
  it('B171 Greenhouse Builder registers an owner-only space with only revealed printed branches', () => {
    const session = setupSession('B171_GreenhouseBuilder')
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.round = 4
    state.roundActionOrder[2] = 'vegetable-seeds'
    state.roundActionOrder[3] = 'house-redevelopment'
    const owner = state.players[0]!
    owner.resources.clay = 2
    owner.resources.reed = 1
    const other = state.players[1]!

    const config = getPlayerActionSpaceConfig('B171_GreenhouseBuilder')
    expect(config?.access).toBe('owner')
    const [space] = createPlayerActionSpaces(state)
    expect(space?.id).toBe('B171_GreenhouseBuilder')
    expect(space?.canBeExecutedByPlayer(state, owner)).toBe(true)
    expect(space?.canBeExecutedByPlayer(state, other)).toBe(false)

    const result = config!.createDefinition(owner.id).execute({
      state,
      player: owner,
      space,
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow.type).toBe('xor')
    expect(leafActionIds(result.flow)).toEqual(['renovate-house', 'improvement', 'gain'])
  })

  it('B171 Greenhouse Builder exposes fencing only after Fencing is revealed and is unavailable with no revealed branches', () => {
    const session = setupSession('B171_GreenhouseBuilder')
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    const owner = state.players[0]!
    const space = createPlayerActionSpaces(state).find((candidate) => candidate.id === 'B171_GreenhouseBuilder')!
    const definition = getPlayerActionSpaceConfig('B171_GreenhouseBuilder')!.createDefinition(owner.id)

    expect(definition.canBeExecutedByPlayer(state, owner)).toBe(false)

    state.roundActionOrder[0] = 'fencing'
    owner.resources.wood = 4
    expect(definition.canBeExecutedByPlayer(state, owner)).toBe(true)
    const result = definition.execute({
      state,
      player: owner,
      space,
    } as unknown as ActionExecutionContext)

    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(leafActionIds(result.flow)).toEqual(['fence'])
  })

  it('B171 Greenhouse Builder ignores future round cards and revealed branches that cannot execute', () => {
    const session = setupSession('B171_GreenhouseBuilder')
    const state = session.getState().state
    state.round = 1
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[6] = 'fencing'
    const owner = state.players[0]!
    const definition = getPlayerActionSpaceConfig('B171_GreenhouseBuilder')!.createDefinition(owner.id)

    expect(definition.canBeExecutedByPlayer(state, owner)).toBe(false)

    state.roundActionOrder[0] = 'fencing'
    owner.resources.wood = 0
    expect(definition.canBeExecutedByPlayer(state, owner)).toBe(false)
  })

  it('D170 Fold Builder registers an all-player space where non-owner pays owner before fencing and sheep', () => {
    const session = setupSession('D170_FoldBuilder')
    const state = session.getState().state
    const owner = state.players[0]!
    const user = state.players[1]!
    owner.resources.food = 0
    user.resources.food = 1
    user.resources.wood = 4

    const config = getPlayerActionSpaceConfig('D170_FoldBuilder')
    expect(config?.access).toBe('all')
    const space = createPlayerActionSpaces(state).find((candidate) => candidate.id === 'D170_FoldBuilder')
    expect(space).toBeDefined()
    expect(space!.canBeExecutedByPlayer(state, user)).toBe(true)

    const result = config!.createDefinition(owner.id).execute({
      state,
      player: user,
      space,
    } as unknown as ActionExecutionContext)

    expect(user.resources.food).toBe(0)
    expect(owner.resources.food).toBe(1)
    expect(result.type).toBe('flow')
    if (result.type !== 'flow') return
    expect(result.flow).toMatchObject({
      type: 'seq',
      children: [
        {
          actionId: 'fence',
          sourceCard: 'D170_FoldBuilder',
          actionContext: { fencePolicy: { cancelPolicy: 'forbidCancel' } },
        },
        { actionId: 'gain', params: { sheep: 1 }, sourceCard: 'D170_FoldBuilder' },
      ],
    })
  })

  it('D170 Fold Builder owner uses it without self-payment and non-owner needs food plus legal fencing', () => {
    const session = setupSession('D170_FoldBuilder')
    const state = session.getState().state
    const owner = state.players[0]!
    const user = state.players[1]!
    owner.resources.food = 2
    owner.resources.wood = 4
    user.resources.food = 0
    user.resources.wood = 4
    const space = createPlayerActionSpaces(state).find((candidate) => candidate.id === 'D170_FoldBuilder')!
    const definition = getPlayerActionSpaceConfig('D170_FoldBuilder')!.createDefinition(owner.id)

    expect(definition.canBeExecutedByPlayer(state, owner)).toBe(true)
    expect(definition.canBeExecutedByPlayer(state, user)).toBe(false)

    user.resources.food = 1
    user.resources.wood = 0
    expect(definition.canBeExecutedByPlayer(state, user)).toBe(false)

    const ownerResult = definition.execute({
      state,
      player: owner,
      space,
    } as unknown as ActionExecutionContext)
    expect(owner.resources.food).toBe(2)
    expect(ownerResult.type).toBe('flow')
  })

  it('D170 Fold Builder pays owner before the protected fence prompt and keeps payment on cancel failure', () => {
    const session = setupSession('D170_FoldBuilder')
    const state = session.getState().state
    state.currentPlayerIndex = 1
    const owner = state.players[0]!
    const user = state.players[1]!
    owner.resources.food = 0
    user.resources.food = 1
    user.resources.wood = 4
    session.loadState(state)

    const resp = session.takeAction(1, 'D170_FoldBuilder')

    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.resources.food).toBe(1)
    expect(resp.state.players[1]!.resources.food).toBe(0)
    expect(resp.interaction.stateId).toBe('wait')

    const cancelled = session.resolveChoice(1, 'cancel')
    expect(cancelled.ok).toBe(false)
    expect(cancelled.state.players[0]!.resources.food).toBe(1)
    expect(cancelled.state.players[1]!.resources.food).toBe(0)
  })

  it('dynamic player action spaces persist through state normalization with occupied workers', () => {
    const session = setupSession('D170_FoldBuilder')
    const state = session.getState().state
    const space = state.actionSpaces.find((candidate) => candidate.id === 'D170_FoldBuilder')
    expect(space).toBeDefined()
    space!.takenBy = [{ playerId: state.players[1]!.id, workerId: '1' }]
    session.loadState(state)

    const restored = session.getState().state.actionSpaces.find((candidate) => candidate.id === 'D170_FoldBuilder')
    expect(restored?.takenBy).toEqual([{ playerId: state.players[1]!.id, workerId: '1' }])
  })
})
