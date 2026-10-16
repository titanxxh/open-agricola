import { describe, expect, it } from 'vitest'
import { GameSession } from '../../../server/game/authoritative-session'
import { getAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { runSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { PlayerState } from '../../contract/types'
import type { DraftGameEvent } from '../../contract/events'
import { getCardEffect } from '../card-effects'
import { readCardExtraData } from '../helpers/card-state'
import { A007_GardenersKnife_impl } from '../A/A007_GardenersKnife'
import { A011_MudPatch_impl } from '../A/A011_MudPatch'
import { A030_BakingSheet_impl } from '../A/A030_BakingSheet'
import { A031_DebtSecurity_impl } from '../A/A031_DebtSecurity'
import { A040_PottersYard_impl } from '../A/A040_PottersYard'
import { A064_BarleyMill_impl } from '../A/A064_BarleyMill'
import { A065_SeedPellets_impl } from '../A/A065_SeedPellets'
import { A068_AsparagusGift_impl } from '../A/A068_AsparagusGift'
import { A070_LiftingMachine_impl } from '../A/A070_LiftingMachine'
import { A072_CalciumFertilizers_impl } from '../A/A072_CalciumFertilizers'
import { A084_Silage_impl } from '../A/A084_Silage'
import { A085_Homekeeper_impl } from '../A/A085_Homekeeper'
import { A106_SlurrySpreader_impl } from '../A/A106_SlurrySpreader'
import { A144_Sequestrator_impl } from '../A/A144_Sequestrator'
import { B021_HayloftBarn_impl } from '../B/B021_HayloftBarn'
import { B031_PotteryYard_impl } from '../B/B031_PotteryYard'
import { B045_StrawberryPatch_impl } from '../B/B045_StrawberryPatch'
import { B061_ThreeFieldRotation_impl } from '../B/B061_ThreeFieldRotation'
import { getFarmHandCandidates } from '../B/B085_FarmHand'
import { B159_LieutenantGeneral_impl } from '../B/B159_LieutenantGeneral'
import '../B/B068_Beanfield'
import '../B/B113_PatchCaregiver'
import '../C/C070_LettucePatch'

const setup = () => {
  const session = new GameSession(802, undefined, { playerCount: 2 })
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
  return { session: session, state, player: state.players[0]! }
}

const setCardField = (
  player: PlayerState,
  cardId: string,
  slots: Array<{ crop: 'grain' | 'vegetable' | 'wood' | 'stone'; remaining: number } | null>,
  zone: 'minor' | 'occupation' = 'minor',
) => {
  player[zone === 'minor' ? 'minorPlayed' : 'occupationPlayed'].push(cardId)
  player.cardStates[cardId] = { extraData: { cardFieldStacks: slots } }
}

describe('A/B Logical Field consumers', () => {
  it('counts Card Fields once for A007, A030, A068, and B045 predicates', () => {
    const { session: ruleSession, state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', [{ crop: 'grain', remaining: 2 }], 'occupation')
    setCardField(player, 'B068_Beanfield', [{ crop: 'vegetable', remaining: 2 }])
    setCardField(player, 'C070_LettucePatch', [{ crop: 'vegetable', remaining: 1 }])

    expect(ruleSession.withCtx(() => A007_GardenersKnife_impl.effect.onBuy!(state, player))).toMatchObject({
      actionId: 'gain',
      params: { food: 1, grain: 2 },
    })
    expect(ruleSession.withCtx(() => A030_BakingSheet_impl.prerequisiteCheck!(player))).toBe(false)
    expect(ruleSession.withCtx(() => A068_AsparagusGift_impl.prerequisiteCheck!(player))).toBe(false)
    expect(ruleSession.withCtx(() => B045_StrawberryPatch_impl.prerequisiteCheck!(player))).toBe(true)
  })

  it('recognizes an empty Card Field for A065 and B061', () => {
    const { session: ruleSession, state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', [{ crop: 'grain', remaining: 2 }], 'occupation')
    setCardField(player, 'B068_Beanfield', [{ crop: 'vegetable', remaining: 2 }])
    setCardField(player, 'C070_LettucePatch', [null])
    const seedPellets = A065_SeedPellets_impl.listeners!.find((listener) => listener.id === 'A65-seed-pellets-isdoable-sow')!

    expect(ruleSession.withCtx(() => seedPellets.handler!({
      state,
      player,
      actionId: 'sow',
      phase: 'isDoable',
      doable: false,
    } as never))).toEqual({ doable: true })
    expect(ruleSession.withCtx(() => B061_ThreeFieldRotation_impl.effect.onStartHarvestFieldPhase!(state, player))).toMatchObject({
      actionId: 'gain',
      params: { food: 3 },
    })
    expect(ruleSession.withCtx(() => A068_AsparagusGift_impl.prerequisiteCheck!(player))).toBe(true)
  })

  it('uses shared Reap evidence for A064, A106, and B021', () => {
    const { session: ruleSession, state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', [null], 'occupation')
    state.harvestReapSummary = {
      [player.id]: {
        resources: { grain: 1 },
        grainFields: 1,
        vegetableFields: 0,
        harvestedCrops: [],
        harvestCountApplications: [],
        harvestedPositions: [{ row: -1, col: 2113 }],
      },
    }
    player.cardStates.B021_HayloftBarn = { extraData: { foodCount: 4 } }

    expect(ruleSession.withCtx(() => A064_BarleyMill_impl.effect.onAfterReap!(state, player))).toMatchObject({
      children: [expect.objectContaining({ params: { food: 1 } })],
    })
    expect(ruleSession.withCtx(() => A106_SlurrySpreader_impl.effect.onAfterReap!(state, player))).toMatchObject({ params: { food: 2 } })
    expect(ruleSession.withCtx(() => B021_HayloftBarn_impl.effect.onAfterReap!(state, player))).toMatchObject({ params: { food: 1 } })
    expect(readCardExtraData<number>(player, 'B021_HayloftBarn', 'foodCount')).toBe(3)
  })

  it('lets A070 remove a vegetable from a Card Field outside harvest', () => {
    const { session: ruleSession, state, player } = setup()
    state.round = 5
    setCardField(player, 'B068_Beanfield', [{ crop: 'vegetable', remaining: 2 }])

    expect(ruleSession.withCtx(() => A070_LiftingMachine_impl.effect.onReturnHome!(state, player))).toMatchObject({
      actionContext: {
        selectableTiles: [expect.objectContaining({ row: -1, col: 2068, sourceCard: 'B068_Beanfield' })],
      },
    })
    runSelectionEffect('take-vegetable', {
      state,
      player,
      positions: ['-1-2068'],
      cards: [],
      sourceCard: 'A070_LiftingMachine',
    })

    expect(player.resources.vegetable).toBe(1)
    expect(player.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
  })

  it('lets A084 count Logical Fields and pay grain from a Card Field', () => {
    const { session: ruleSession, state, player } = setup()
    state.round = 5
    player.minorPlayed.push('A084_Silage')
    player.resources.cattle = 2
    setCardField(player, 'B113_PatchCaregiver', [{ crop: 'grain', remaining: 2 }], 'occupation')
    setCardField(player, 'B068_Beanfield', [null])

    expect(ruleSession.withCtx(() => A084_Silage_impl.effect.onReturnHome!(state, player))).toMatchObject({ type: 'xor' })
    expect(ruleSession.withCtx(() => getAdHocAction('card_A084_Silage_pay-grain-any')!.resolveChoice!({ state, player } as never, 'card:B113_PatchCaregiver'))).toEqual({ type: 'ok' })
    expect(player.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([
      { crop: 'grain', remaining: 1 },
    ])
  })
})

describe('A/B Farmyard Field consumers', () => {
  it('does not treat a Card Field as Farmyard geometry', () => {
    const { session: ruleSession, state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', [null], 'occupation')
    player.occupationPlayed.push('A144_Sequestrator')
    ruleSession.withCtx(() => A144_Sequestrator_impl.effect.onBuy!(state, player))

    const zones: never[] = []
    ruleSession.withCtx(() => A011_MudPatch_impl.effect.onComputeAnimalZones!(player, zones, state))
    const plowListener = A144_Sequestrator_impl.listeners!.find((listener) => listener.id.includes('after-plow'))!
    const lieutenant = B159_LieutenantGeneral_impl.listeners![0]!

    expect(zones).toEqual([])
    expect(ruleSession.withCtx(() => A072_CalciumFertilizers_impl.prerequisiteCheck!(player))).toBe(true)
    expect(ruleSession.withCtx(() => A085_Homekeeper_impl.effect.computeExtraRoomCapacity!(player))).toBe(0)
    expect(getFarmHandCandidates(player)).toEqual([])
    expect(ruleSession.withCtx(() => plowListener.handler!({ state, player, actionId: 'plow', phase: 'after' } as never))).toBeUndefined()
    expect(ruleSession.withCtx(() => lieutenant.handler!({ state, player, triggerPlayer: player, actionId: 'plow', phase: 'after' } as never))).toBeUndefined()
    expect(ruleSession.withCtx(() => A031_DebtSecurity_impl.effect.computeBonusScore!(state, player))).toBe(0)
    expect(ruleSession.withCtx(() => B031_PotteryYard_impl.effect.computeBonusScore!(state, player))).toBe(2)
  })

  it('places A040 clay on seven unused Farmyard spaces without counting a Card Field as geometry', () => {
    const { session: ruleSession, state, player } = setup()
    setCardField(player, 'B113_PatchCaregiver', [null], 'occupation')
    player.fields = [0, 1, 2].flatMap(row => [3, 4].map(col => ({ row, col, stacks: [] })))
    player.minorPlayed.push('A040_PottersYard')
    expect(ruleSession.withCtx(() => A040_PottersYard_impl.prerequisiteCheck!(player))).toBe(true)
    const flow = ruleSession.withCtx(() => ruleSession.withCtx(() => getCardEffect('A040_PottersYard'))!.onBuy!(state, player))
    if (!flow || flow.type !== 'leaf') throw new Error('Expected A040 placement action')
    const action = getAdHocAction(flow.actionId)
    if (!action) throw new Error(`Missing placement action ${flow.actionId}`)
    const events: DraftGameEvent[] = []

    expect(ruleSession.withCtx(() => action.execute({
      state, player, space: state.actionSpaces[0]!, params: flow.params, sourceCard: flow.sourceCard,
      eventSink: { emit: event => events.push(event), emitMany: emitted => events.push(...emitted) },
    })).type).toBe('ok')

    expect(player.farmyardSpaceStates).toEqual(['0-0', '0-1', '0-2', '1-1', '1-2', '2-1', '2-2'].map(spaceKey => ({
      spaceKey, sourceCardId: 'A040_PottersYard', kind: 'farmyard-goods-token',
      resources: { clay: 1 }, claimPolicy: 'when-no-longer-unused',
    })))
    expect(player.resources.clay).toBe(0)
    expect(player.cardStates.B113_PatchCaregiver?.extraData?.cardFieldStacks).toEqual([null])
    expect(events.filter(event => event.type === 'resource.moved')).toHaveLength(7)
  })
})
