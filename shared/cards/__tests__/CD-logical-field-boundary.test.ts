import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import type { PlayerState } from '../../contract/types'
import { C008_PlantFertilizer_impl } from '../C/C008_PlantFertilizer'
import { C033_GreeningPlan_impl } from '../C/C033_GreeningPlan'
import { C047_GardenClaw_impl } from '../C/C047_GardenClaw'
import { C059_SchnappsDistillery_impl } from '../C/C059_SchnappsDistillery'
import { C072_FestivalPlanning_impl } from '../C/C072_FestivalPlanning'
import { C099_GardenDesigner_impl } from '../C/C099_GardenDesigner'
import { C120_AgriculturalLabourer_impl } from '../C/C120_AgriculturalLabourer'
import { C161_PotatoDigger_impl } from '../C/C161_PotatoDigger'
import { computeZigzagCandidates } from '../D/D001_ZigzagHarrow'
import { D005_FieldClay_impl } from '../D/D005_FieldClay'
import { D008_FernSeeds_impl } from '../D/D008_FernSeeds'
import { D031_Storeroom_impl } from '../D/D031_Storeroom'
import { D032_WoodRake_impl } from '../D/D032_WoodRake'
import { D061_BaleofStraw_impl } from '../D/D061_BaleofStraw'
import { D079_CarrotMuseum_impl } from '../D/D079_CarrotMuseum'
import { D135_GardeningHeadOfficial_impl } from '../D/D135_GardeningHeadOfficial'
import { D153_WealthyMan_impl } from '../D/D153_WealthyMan'
import '../B/B068_Beanfield'
import '../B/B113_PatchCaregiver'
import '../B/B141_FieldCaretaker'
import '../D/D025_WitchesDanceFloor'

const setup = () => {
  const session = new GameSession(803, undefined, { playerCount: 2 })
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

describe('C/D Logical Field consumers', () => {
  it('uses Card Fields for planted and empty field rules', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', 'grain', 2, 'occupation')
    setCardField(player, 'B068_Beanfield', 'vegetable', 2)
    setCardField(player, 'B141_FieldCaretaker', null, 0, 'occupation')
    setCardField(player, 'D025_WitchesDanceFloor', null)
    player.resources.food = 2

    C047_GardenClaw_impl.effect.onBuy!(state, player)

    expect(D005_FieldClay_impl.effect.onBuy!(state, player)).toMatchObject({
      children: [expect.objectContaining({ params: { clay: 2 } })],
    })
    expect(D008_FernSeeds_impl.prerequisiteCheck!(player)).toBe(true)
    expect(C033_GreeningPlan_impl.effect.computeBonusScore!(state, player)).toBe(1)
    expect(C099_GardenDesigner_impl.effect.onBeforeEndGame!(state, player)).toMatchObject({
      actionId: 'emit-choice',
      params: { options: expect.arrayContaining([
        expect.objectContaining({ effectPreview: { kind: 'resourceExchange', resourcesPaid: { food: 2 }, bonusVp: 2 } }),
      ]) },
    })
    const festival = C072_FestivalPlanning_impl.effect.onBuy!(state, player)
    expect(festival.type === 'seq' ? festival.children[0] : undefined).toMatchObject({ actionId: 'reap' })
    expect(state.pendingFutureMeeples).toContainEqual(expect.objectContaining({ count: 6 }))
  })

  it('counts crops stored on Card Fields for scoring and round rewards', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', 'grain', 5, 'occupation')
    setCardField(player, 'B068_Beanfield', 'vegetable', 2)
    player.resources.vegetable = 3
    state.round = 14

    expect(C059_SchnappsDistillery_impl.effect.computeBonusScore!(state, player)).toBe(1)
    expect(D031_Storeroom_impl.effect.computeBonusScore!(state, player)).toBe(3)
    expect(D032_WoodRake_impl.effect.onBeforeHarvest!(state, player)).toMatchObject({ type: 'seq' })
    state.round = 8
    expect(D079_CarrotMuseum_impl.effect.onAfterRoundEnd!(state, player)).toMatchObject({
      params: { stone: 1, wood: 3 },
    })
    expect(D135_GardeningHeadOfficial_impl.effect.computeBonusScore!(state, player)).toBe(2)
  })

  it('counts each grain Card Field once for harvest thresholds', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', 'grain', 3, 'occupation')
    setCardField(player, 'B141_FieldCaretaker', 'grain', 2, 'occupation')
    setCardField(player, 'D025_WitchesDanceFloor', 'grain', 1)
    state.round = 9

    expect(D061_BaleofStraw_impl.effect.onStartHarvest!(state, player)).toMatchObject({ params: { food: 2 } })
    expect(D153_WealthyMan_impl.effect.onStartHarvest!(state, player)).toMatchObject({ actionId: 'bonus-vp' })
  })

  it('uses Card Field locations and shared Reap evidence', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', 'grain', 1, 'occupation')
    player.occupationPlayed.push('C120_AgriculturalLabourer')
    player.cardStates.C120_AgriculturalLabourer = { counters: { clay: 2 } }
    state.harvestReapSummary = {
      [player.id]: { resources: { grain: 2 }, grainFields: 1, vegetableFields: 0 },
    }

    const fertilizer = C008_PlantFertilizer_impl.effect.onBuy!(state, player)
    expect(fertilizer?.type === 'seq' ? fertilizer.children[0] : undefined).toMatchObject({
      actionId: 'special-effect',
      params: { locations: [{ kind: 'card-field', cardId: 'B113_PatchCaregiver' }] },
    })
    expect(C120_AgriculturalLabourer_impl.effect.onAfterReap!(state, player)).toMatchObject({
      children: [expect.objectContaining({ params: { clay: 2 } })],
    })
  })
})

describe('C/D Farmyard Field consumers', () => {
  it('does not treat an empty Card Field as farmyard geometry', () => {
    const { state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', null, 0, 'occupation')

    expect(C161_PotatoDigger_impl.effect.onBuy!(state, player)).toBeUndefined()
    expect(computeZigzagCandidates(player)).toEqual([])
  })
})
