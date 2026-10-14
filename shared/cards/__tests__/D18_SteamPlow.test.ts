import { expect, it } from 'vitest'
import { runCardEffectHook } from '../card-effects'
import { createInitialState } from '../../session/state-bootstrap'
import '../D/D018_SteamPlow'

it.each([{ wood: 1, food: 3 }, { wood: 5, food: 0 }])(
  'Steam Plow cannot offer its exchange with $wood wood and $food food',
  ({ wood, food }) => {
    const state = createInitialState(42, { playerCount: 2 })
    const player = state.players[0]!
    player.minorPlayed = ['D018_SteamPlow']
    player.resources.wood = wood
    player.resources.food = food
    expect(runCardEffectHook(state, player, 'D018_SteamPlow', 'onStartReturnHome')).toBeNull()
    expect(player.resources).toMatchObject({ wood, food })
  },
)
