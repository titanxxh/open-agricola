import { describe, expect, it } from 'vitest'
import type { GameState, PlayerState } from '../../contract/types'
import type { ActionSpace } from '../../contract/types'
import type { CardListenerContext } from '../card-listeners'
import type { ActionFlow } from '../../contract/types'
import { getRegisteredCardListeners } from '../card-listeners'
import { MinorImprovement } from '../registry-display'
import { registerAdHocMinorImprovement } from '../registry-runtime'
import { playerHasCardCapability } from '../helpers/card-type'
import { B153_Housemaster_impl } from '../B/B153_Housemaster'

import '../A/A060_OrientalFireplace'
import '../C/C075_Firewood'
import '../E/E144_WaresSalesman'
import '../D/D060_LargePottery'
import '../B/B068_Beanfield'
import '../D/D025_WitchesDanceFloor'
import '../D/D064_BakingCourse'
import '../M/M085_OvenInstallation'

registerAdHocMinorImprovement(new MinorImprovement({
  id: 'TEST_WaresSingle',
  name: 'Test Wares Single',
  deck: 'TEST',
  number: 1,
  desc: [],
  waresSalesmanGains: [{ wood: 1, reed: 1 }],
}))

registerAdHocMinorImprovement(new MinorImprovement({
  id: 'TEST_WaresMulti',
  name: 'Test Wares Multi',
  deck: 'TEST',
  number: 2,
  desc: [],
  waresSalesmanGains: [{ clay: 1, reed: 1 }, { reed: 2 }],
}))

registerAdHocMinorImprovement(new MinorImprovement({
  id: 'TEST_WaresNone',
  name: 'Test Wares None',
  deck: 'TEST',
  number: 3,
  desc: [],
}))

const makePlayer = (overrides: Partial<PlayerState> = {}): PlayerState =>
  ({
    improvements: [],
    minorPlayed: [],
    occupationPlayed: [],
    minorHand: [],
    occupationHand: [],
    cardStates: {},
    ...overrides,
  }) as unknown as PlayerState

const state = {} as GameState

const firewoodListener = () =>
  getRegisteredCardListeners().find((listener) => listener.id === 'C75-firewood-after-build')!

const runFirewood = (choice: string) => {
  const player = makePlayer({
    minorPlayed: ['C075_Firewood'],
    cardStates: { C075_Firewood: { counters: { wood: 2 } } },
  })
  return firewoodListener().handler({
    state,
    player,
    space: {} as ActionSpace,
    actionId: 'improvement',
    phase: 'after',
    choice,
  } as unknown as CardListenerContext)
}

const waresListener = () =>
  getRegisteredCardListeners().find((listener) => listener.id === 'E144-wares-salesman-after-improvement')!

const runWaresSalesman = (choice: string) =>
  waresListener().handler({
    state,
    player: makePlayer({ occupationPlayed: ['E144_WaresSalesman'] }),
    space: {} as ActionSpace,
    actionId: 'improvement',
    phase: 'after',
    choice,
  } as unknown as CardListenerContext)

describe('identity metadata migrations', () => {
  describe('played-card capabilities', () => {
    it('treats Oriental Fireplace as a fireplace-like played major', () => {
      const player = makePlayer({
        minorPlayed: ['A060_OrientalFireplace'],
      })

      expect(playerHasCardCapability(player, 'fireplaceIdentity', { asType: 'major' })).toBe(true)
    })

    it('treats Pottery and Large Pottery as pottery-like played majors', () => {
      expect(playerHasCardCapability(makePlayer({ improvements: ['Major_Pottery'] }), 'potteryIdentity', { asType: 'major' })).toBe(true)
      expect(playerHasCardCapability(makePlayer({ minorPlayed: ['D060_LargePottery'] }), 'potteryIdentity', { asType: 'major' })).toBe(true)
    })
  })

  describe('B153_Housemaster', () => {
    it('scores major-like minors through major identity collection', () => {
      const player = makePlayer({
        minorPlayed: ['D060_LargePottery'],
      })

      expect(B153_Housemaster_impl.effect.computeBonusScore!(state, player)).toBe(1)
    })

    it('does not score ordinary minors as majors', () => {
      const player = makePlayer({
        minorPlayed: ['B068_Beanfield'],
      })

      expect(B153_Housemaster_impl.effect.computeBonusScore!(state, player)).toBe(0)
    })
  })

  describe('C075_Firewood', () => {
    it('triggers from explicit fireplace identity on Witches Dance Floor', () => {
      const result = runFirewood('minor:D025_WitchesDanceFloor')

      expect(result?.flow?.type).toBe('xor')
      expect((result?.flow as Extract<ActionFlow, { type: 'xor' }>).children).toHaveLength(2)
    })

    it('does not trigger from a baking card without fireplace, cooking-hearth, or oven identity', () => {
      expect(runFirewood('minor:D064_BakingCourse')).toBeUndefined()
    })

    it('does not trigger from the Oven Installation upgrade', () => {
      expect(runFirewood('minor:M085_OvenInstallation')).toBeUndefined()
    })
  })

  describe('E144_WaresSalesman', () => {
    it('uses card metadata for a single wares gain', () => {
      const result = runWaresSalesman('minor:TEST_WaresSingle')

      expect(result?.flow).toMatchObject({
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 1, reed: 1 },
      })
    })

    it('uses card metadata for multiple wares gain choices', () => {
      const result = runWaresSalesman('minor:TEST_WaresMulti')

      expect(result?.flow?.type).toBe('xor')
      expect((result?.flow as Extract<ActionFlow, { type: 'xor' }>).children.map((child) => child.params)).toEqual([
        { clay: 1, reed: 1 },
        { reed: 2 },
      ])
    })

    it('uses production card metadata for wares gain choices', () => {
      const result = runWaresSalesman('minor:C055_Studio')

      expect(result?.flow?.type).toBe('xor')
      expect((result?.flow as Extract<ActionFlow, { type: 'xor' }>).children.map((child) => child.params)).toEqual([
        { wood: 1, reed: 1 },
        { clay: 1, reed: 1 },
        { stone: 1, reed: 1 },
      ])
    })

    it('uses major card metadata for wares gain choices', () => {
      const result = runWaresSalesman('major:Major_Joinery')

      expect(result?.flow).toMatchObject({
        type: 'leaf',
        actionId: 'gain',
        params: { wood: 1, reed: 1 },
      })
    })

    it('does not trigger for cards without wares metadata', () => {
      expect(runWaresSalesman('minor:TEST_WaresNone')).toBeUndefined()
    })

    it('does not trigger for major cards without wares metadata', () => {
      expect(runWaresSalesman('major:Major_Well')).toBeUndefined()
    })
  })
})
