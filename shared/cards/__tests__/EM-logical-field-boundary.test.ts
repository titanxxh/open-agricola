import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import type { CardListenerContext } from '../card-listeners'
import type { PlayerState } from '../../contract/types'
import { E023_Apiary_impl } from '../E/E023_Apiary'
import { E025_BumperCrop_impl } from '../E/E025_BumperCrop'
import { E026_Sundial_impl } from '../E/E026_Sundial'
import { E034_LandRegister_impl } from '../E/E034_LandRegister'
import { E071_CowPatty_impl } from '../E/E071_CowPatty'
import { E092_FieldDoctor_impl } from '../E/E092_FieldDoctor'
import { E107_LandSurveyor_impl } from '../E/E107_LandSurveyor'
import { E117_PipeSmoker_impl } from '../E/E117_PipeSmoker'
import { E135_Pickler_impl } from '../E/E135_Pickler'
import { M025_HouseholdInventory_impl } from '../M/M025_HouseholdInventory'
import { M058_PeatFertilizer_impl } from '../M/M058_PeatFertilizer'
import { M111_NoTillFarming_impl } from '../M/M111_NoTillFarming'
import { hasFarmShape, hasGrowingCrop } from '../M/moor-batch1-helpers'
import '../B/B068_Beanfield'
import '../B/B113_PatchCaregiver'

const setup = () => {
  const session = new GameSession(804, undefined, { playerCount: 2 })
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.fields = []
    player.cardStates = {}
  })
  return { state, player: state.players[0]! }
}

const setCardField = (
  player: PlayerState,
  cardId: string,
  crop: 'grain' | 'vegetable' | null,
  remaining = 0,
  zone: 'minor' | 'occupation' = 'minor',
) => {
  player[zone === 'minor' ? 'minorPlayed' : 'occupationPlayed'].push(cardId)
  player.cardStates[cardId] = {
    extraData: { cardFieldStacks: [crop ? { crop, remaining } : null] },
  }
}

describe('E/M Logical Field consumers', () => {
  it('uses empty Card Fields for field-count rules', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', null, 0, 'occupation')
    setCardField(player, 'B068_Beanfield', null)
    state.round = 7
    player.resources.grain = 1

    expect(E023_Apiary_impl.effect.onBeforeReturnHome!(state, player)).toMatchObject({ type: 'seq' })
    expect(E026_Sundial_impl.effect.onBeforeReturnHome!(state, player)).toMatchObject({ type: 'seq' })
    expect(E107_LandSurveyor_impl.effect.onHarvestFieldPhase!(state, player)).toMatchObject({ params: { food: 1 } })
    expect(M025_HouseholdInventory_impl.prerequisiteCheck!(player)).toBe(true)
    expect(M058_PeatFertilizer_impl.prerequisiteCheck!(player)).toBe(true)
    expect(M058_PeatFertilizer_impl.listeners![0]!.handler!({
      state,
      player,
      actionId: 'cut-peat',
      phase: 'after',
    } as unknown as CardListenerContext)).toMatchObject({ flow: { actionId: 'sow' } })
    expect(M111_NoTillFarming_impl.prerequisiteCheck!(player)).toBe(true)
    expect(hasFarmShape(player)).toBe(true)
  })

  it('uses Card Field crops and rejects the wrong crop', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', 'grain', 2, 'occupation')

    expect(E025_BumperCrop_impl.effect.onBuy!(state, player)).toMatchObject({ actionId: 'reap' })
    expect(E117_PipeSmoker_impl.effect.onStartHarvest!(state, player)).toMatchObject({ params: { wood: 2 } })
    expect(hasGrowingCrop(player, 'grain')).toBe(true)
    expect(hasGrowingCrop(player, 'vegetable')).toBe(false)

    player.cardStates.B113_PatchCaregiver = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
    }
    expect(E117_PipeSmoker_impl.effect.onStartHarvest!(state, player)).toBeUndefined()
    expect(E135_Pickler_impl.effect.computeBonusScore!(state, player)).toBe(3)
  })
})

describe('E/M Farmyard Field consumers', () => {
  it('does not treat Card Fields as farmyard geometry', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', 'grain', 2, 'occupation')

    const cowPatty = E071_CowPatty_impl.listeners![0]!
    const fieldDoctor = E092_FieldDoctor_impl.listeners![0]!
    expect(E034_LandRegister_impl.effect.computeBonusScore!(state, player)).toBe(0)
    expect(cowPatty.handler!({
      state,
      player,
      actionId: 'sow',
      phase: 'after',
      actionEvents: [{
        type: 'farm.sown',
        sows: [{
          location: { kind: 'card', playerId: player.id, cardId: 'B113_PatchCaregiver' },
          crop: 'grain',
          amount: 3,
        }],
      }],
      transactionEvents: [],
    } as unknown as CardListenerContext)).toBeUndefined()
    expect(fieldDoctor.handler!({
      state,
      player,
      space: { id: 'wish-children' },
      actionId: 'family-growth',
      phase: 'computeReplace',
    } as unknown as CardListenerContext)).toBeUndefined()
  })
})
