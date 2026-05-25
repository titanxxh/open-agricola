import { afterEach, describe, expect, it } from 'vitest'
import { collectAction } from '../../actions/effects/collect'
import { placeFarmerAction } from '../../actions/effects/place-farmer'
import { clearActionHooks, registerActionHook } from '../../actions/hooks'
import type { ActionSpace, Resource } from '../../contract/types'
import { setWorkersAtHome } from '../../domain/player'
import { createInitialPlayerStats } from '../../session/stats'
import { ActionNode } from '../nodes'
import {
  asActionSpace,
  makeEventTestEngine,
  makeEventTestPlayer,
  makeEventTestState,
} from './event-test-helpers'

const resources = (values: Partial<Resource> = {}): Resource => ({
  wood: 0,
  clay: 0,
  reed: 0,
  stone: 0,
  food: 0,
  grain: 0,
  vegetable: 0,
  sheep: 0,
  boar: 0,
  cattle: 0,
  begging: 0,
  ...values,
})

const hostSpace = (): ActionSpace => ({
  id: 'place-farmer',
  nameKey: 'actions.place-farmer.name',
  descriptionKey: 'actions.place-farmer.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
  resources: resources(),
  takenBy: [],
})

describe('actionContext targetSpaceId execution', () => {
  afterEach(() => clearActionHooks())

  it('uses selected place-farmer target as context.space for place-farmer after hooks', () => {
    const player = makeEventTestPlayer()
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
    const state = makeEventTestState()
    const host = hostSpace()
    host.id = 'vegetable-seeds'
    const forest = hostSpace()
    forest.id = 'forest'
    state.players = [player]
    state.actionSpaces = [host, forest]
    setWorkersAtHome(state, player, 1)
    let afterSpaceId: string | undefined

    registerActionHook({
      id: 'target-space-after-place-farmer',
      actions: ['place-farmer'],
      phases: ['after'],
      handler: (context) => {
        afterSpaceId = context.space.id
      },
    })

    const { engine } = makeEventTestEngine(
      [placeFarmerAction],
      new ActionNode('extra-place-farmer', 'place-farmer'),
    )

    const prompt = engine.proceed({ state, player, space: host })
    expect(prompt.type).toBe('choice')
    const result = engine.resolveChoice('forest', { state, player, space: host })

    expect(result.type).toBe('flow')
    expect(forest.takenBy).toEqual([{ playerId: player.id, workerId: 'w1' }])
    expect(afterSpaceId).toBe('forest')
  })

  it('uses targetSpaceId as context.space for action execution and after hooks', () => {
    const player = makeEventTestPlayer()
    player.stats = createInitialPlayerStats({ isFirstPlayer: false })
    const state = makeEventTestState()
    const forest = {
      ...asActionSpace(collectAction),
      id: 'forest',
      gainPerRound: { wood: 3 },
      resources: resources({ wood: 3 }),
      takenBy: [{ playerId: player.id, workerId: '1' }],
    }
    const host = hostSpace()
    state.players = [player]
    state.actionSpaces = [host, forest]
    let afterSpaceId: string | undefined

    registerActionHook({
      id: 'target-space-after-collect',
      actions: ['collect'],
      phases: ['after'],
      handler: (context) => {
        afterSpaceId = context.space.id
      },
    })

    const { engine } = makeEventTestEngine(
      [collectAction],
      new ActionNode(
        'collect-from-target',
        'collect',
        undefined,
        undefined,
        undefined,
        undefined,
        { targetSpaceId: 'forest' },
      ),
    )

    const result = engine.proceed({ state, player, space: host })

    expect(result.type).toBe('ok')
    expect(player.resources.wood).toBe(3)
    expect(forest.resources.wood).toBe(0)
    expect(afterSpaceId).toBe('forest')
  })
})
