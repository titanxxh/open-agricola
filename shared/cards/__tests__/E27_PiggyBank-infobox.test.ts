import { describe, it, expect } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { readCardInfobox } from '../helpers/card-state'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

import '../E/E27_PiggyBank'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 1, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    cardStates: {
      E27_PiggyBank: { counters: { food: 3 } },
    },
    minorPlayed: ['E27_PiggyBank'],
  } as unknown as PlayerState)

const createState = (player: PlayerState): GameState =>
  ({ players: [player] } as unknown as GameState)

const createSpace = (id: string): ActionSpace =>
  ({ id, resources: {} } as unknown as ActionSpace)

describe('E27_PiggyBank infobox', () => {
  it('writes infobox "n / 6" reflecting current food on card after store/take', () => {
    const listener = getRegisteredCardListeners().find((l) => l.id === 'E27-piggy-bank-after-store')!
    const player = createPlayer()

    executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('any'),
      actionId: 'store-on-card',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(readCardInfobox(player, 'E27_PiggyBank')).toBe('3 / 6')
  })
})
