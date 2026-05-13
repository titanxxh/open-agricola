import { describe, it, expect } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { readCardInfobox } from '../helpers/card-state'
import { specialEffectAction } from '../../actions/effects/special-effect'
import type { ActionFlow, GameState, PlayerState, ActionSpace } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

import '../D/D36_BreedRegistry'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    cardStates: {},
    minorPlayed: ['D36_BreedRegistry'],
  } as unknown as PlayerState)

const createState = (player: PlayerState): GameState =>
  ({ players: [player], log: [] } as unknown as GameState)

const createSpace = (id: string): ActionSpace =>
  ({ id, resources: {} } as unknown as ActionSpace)

const findListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)!

const executeSpecialEffectLeaves = (
  flow: ActionFlow | undefined,
  state: GameState,
  player: PlayerState,
  space: ActionSpace = createSpace('test'),
) => {
  if (!flow) return
  if (flow.type === 'seq') {
    flow.children.forEach((child) => executeSpecialEffectLeaves(child, state, player, space))
    return
  }
  if (flow.type !== 'leaf' || flow.actionId !== 'special-effect') return
  specialEffectAction.execute({
    state,
    player,
    space,
    params: flow.params,
    sourceCard: flow.sourceCard,
    actionContext: flow.actionContext,
  })
}

describe('D36_BreedRegistry infobox', () => {
  it('writes infobox "n / 2" after gaining sheep from collect', () => {
    const listener = findListener('D36-breed-registry-after-collect')
    const player = createPlayer()

    let state = createState(player)
    let result = executeCardListener(listener, {
      state,
      player,
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { sheep: 1 } },
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('1 / 2')

    state = createState(player)
    result = executeCardListener(listener, {
      state,
      player,
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { sheep: 2 } },
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('3 / 2')
  })
})
