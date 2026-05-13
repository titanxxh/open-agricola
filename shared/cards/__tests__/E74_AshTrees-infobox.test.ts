import { describe, it, expect } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { readCardInfobox } from '../helpers/card-state'
import { specialEffectAction } from '../../actions/effects/special-effect'
import type { ActionFlow, GameState, PlayerState, ActionSpace } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

import '../E/E74_AshTrees'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    cardStates: {
      E74_AshTrees: { counters: { fences: 5 } },
    },
    minorPlayed: ['E74_AshTrees'],
    fences: 0,
    pastures: [],
    fenceSegments: [],
  } as unknown as PlayerState)

const createState = (player: PlayerState): GameState =>
  ({ players: [player] } as unknown as GameState)

const createSpace = (id: string): ActionSpace =>
  ({ id, resources: {} } as unknown as ActionSpace)

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

describe('E74_AshTrees infobox', () => {
  it('writes infobox "n / 5" reflecting remaining free fences after fence', () => {
    const listener = getRegisteredCardListeners().find((l) => l.id === 'E74-ash-trees-after-fence')!
    const player = createPlayer()
    // Simulate having consumed 2 free fences -> counters shows 3 left
    player.cardStates!.E74_AshTrees!.counters!.fences = 3

    const state = createState(player)
    const result = executeCardListener(listener, {
      state,
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'after',
    } as unknown as CardListenerContext)
    executeSpecialEffectLeaves(result?.flow, state, player)

    expect(readCardInfobox(player, 'E74_AshTrees')).toBe('3 / 5')
  })
})
