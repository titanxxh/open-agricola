import { describe, expect, it } from 'vitest'
import { computePaymentOptionsForTest } from '../../actions/payment/__tests__/test-helpers'
import { D015_ClaySupports } from '../D/D015_ClaySupports'
import { createInitialState } from '../../session/state-bootstrap'
import { installOfficialCardRegistry } from './card-environment'
import type { PlayerState } from '../../contract/types'

installOfficialCardRegistry()

const makePlayer = (houseType: PlayerState['houseType'] = 'clay') => {
  const player = createInitialState(1636, { playerCount: 2 }).players[0]!
  player.houseType = houseType
  Object.assign(player.resources, { wood: 99, clay: 99, reed: 99, stone: 99 })
  player.activeModifiers = [...D015_ClaySupports.impl.modifiers]
  return player
}

const prices = (player: PlayerState, count: number) => computePaymentOptionsForTest(
  player, { unitFee: { [player.houseType]: 5, reed: 2 }, nb: count }, 'construct',
).map(solution => Object.fromEntries(Object.entries(solution.resourcesPaid).filter(([, amount]) => amount > 0)))

describe('Clay Supports complete room price', () => {
  it('requires the full alternative price when ordinary construction is unaffordable', () => {
    const player = makePlayer()
    Object.assign(player.resources, { wood: 1, clay: 1, reed: 1 })
    expect(prices(player, 1)).toEqual([])
    player.resources.clay = 2
    expect(prices(player, 1)).toEqual([{ clay: 2, reed: 1, wood: 1 }])
  })

  it('can choose the ordinary or Supports price independently for each of two rooms', () => {
    const paid = prices(makePlayer(), 2)
    expect(paid).toHaveLength(3)
    expect(paid).toEqual(expect.arrayContaining([
      { clay: 10, reed: 4 }, { clay: 7, reed: 3, wood: 1 }, { clay: 4, reed: 2, wood: 2 },
    ]))
  })

  it('offers both incomparable complete prices for one clay room', () => {
    expect(prices(makePlayer(), 1)).toEqual(expect.arrayContaining([
      { clay: 5, reed: 2 }, { clay: 2, reed: 1, wood: 1 },
    ]))
    expect(prices(makePlayer(), 1)).toHaveLength(2)
  })

  it.each(['wood', 'stone'] as const)('does not change a %s room price', material => {
    expect(prices(makePlayer(material), 1)).toEqual([{ [material]: 5, reed: 2 }])
  })
})
