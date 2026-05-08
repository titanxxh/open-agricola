import { describe, it, expect } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { readCardInfobox } from '../helpers/card-state'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'
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

describe('D36_BreedRegistry infobox', () => {
  it('writes infobox "n / 2" after gaining sheep from collect', () => {
    const listener = findListener('D36-breed-registry-after-collect')
    const player = createPlayer()

    executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { sheep: 1 } },
    } as unknown as CardListenerContext)

    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('1 / 2')

    executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('sheep-market'),
      actionId: 'collect',
      phase: 'after',
      result: { type: 'ok', resourcesGained: { sheep: 2 } },
    } as unknown as CardListenerContext)

    expect(readCardInfobox(player, 'D36_BreedRegistry')).toBe('3 / 2')
  })
})
