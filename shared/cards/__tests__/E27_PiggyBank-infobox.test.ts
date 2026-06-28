import { describe, it, expect } from 'vitest'
import { getRegisteredCardListeners, executeCardListener } from '../card-listeners'
import { readCardInfobox } from '../helpers/card-state'
import { specialEffectAction } from '../../actions/effects/special-effect'
import type { GameState, PlayerState, ActionSpace } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'

import '../E/E027_PiggyBank'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 1, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    cardStates: {
      E027_PiggyBank: { counters: { food: 3 } },
    },
    minorPlayed: ['E027_PiggyBank'],
  } as unknown as PlayerState)

const createState = (player: PlayerState): GameState =>
  ({ players: [player] } as unknown as GameState)

const createSpace = (id: string): ActionSpace =>
  ({ id, resources: {} } as unknown as ActionSpace)

describe('E027_PiggyBank infobox', () => {
  it('returns an infobox special-effect reflecting current food on card after store/take', () => {
    const listener = getRegisteredCardListeners().find((l) => l.id === 'E27-piggy-bank-after-store')!
    const player = createPlayer()
    const state = createState(player)
    const space = createSpace('any')

    const result = executeCardListener(listener, {
      state,
      player,
      space,
      actionId: 'store-on-card',
      phase: 'after',
    } as unknown as CardListenerContext)

    expect(readCardInfobox(player, 'E027_PiggyBank')).toBeUndefined()
    expect(result?.flow).toMatchObject({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: 'E027_PiggyBank',
      params: { kind: 'set-infobox', text: '3 / 6' },
    })
    if (result?.flow?.type !== 'leaf') return
    specialEffectAction.execute({
      state,
      player,
      space,
      sourceCard: result.flow.sourceCard,
      params: result.flow.params,
      actionContext: result.flow.actionContext,
    })

    expect(readCardInfobox(player, 'E027_PiggyBank')).toBe('3 / 6')
  })
})
