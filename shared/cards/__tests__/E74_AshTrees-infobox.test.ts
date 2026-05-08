import { describe, it, expect } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { readCardInfobox } from '../helpers/card-state'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'
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

describe('E74_AshTrees infobox', () => {
  it('writes infobox "n / 5" reflecting remaining free fences after fence', () => {
    const listener = getRegisteredCardListeners().find((l) => l.id === 'E74-ash-trees-after-fence')!
    const player = createPlayer()
    // Simulate having consumed 2 free fences -> counters shows 3 left
    player.cardStates!.E74_AshTrees!.counters!.fences = 3

    executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('fence'),
      actionId: 'fence',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(readCardInfobox(player, 'E74_AshTrees')).toBe('3 / 5')
  })
})
