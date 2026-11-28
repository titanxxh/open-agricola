import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveNonSkipChoice, withManualReactionOrder } from './_helpers/trigger-select'

const ROTATOR = 'CWM014_CropRotator'
const ROOTS = 'CWM077_EdibleRoots'
const BEANFIELD = 'B068_Beanfield'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession(
    withManualReactionOrder({
      seed: 1477,
      configure: (state) => {
        state.round = round
        const grainUtilIdx = state.roundActionOrder.indexOf('grain-utilization')
        if (grainUtilIdx >= 0) {
          state.roundActionOrder[grainUtilIdx] = state.roundActionOrder[0]!
          state.roundActionOrder[0] = 'grain-utilization'
        }
        for (const player of state.players) {
          player.resources.food = 10
          setWorkersAtHome(state, player, 2)
        }
        configure(state)
      },
    }),
  )
  sessions.push(session)
  return session
}

describe('CWM014_CropRotator & CWM077_EdibleRoots session', () => {
  it('CWM014_CropRotator harvests planted fields on play, offers opposite-crop sow ONLY on the newly emptied field, and handles 0 planted fields cleanly', () => {
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.occupationHand = [ROTATOR]
      Object.assign(p0.resources, { grain: 0, vegetable: 1 })
      p0.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] }, // will become empty
        { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] }, // 1 remaining -> NOT empty
        { row: 0, col: 4, stacks: [] }, // already empty before reap -> NOT newly emptied
      ]
    })

    let lessons = session.takeAction(0, 'lessons')
    if (
      lessons.interaction.stateId === 'wait'
      && sessionOptions(lessons).some((o) => o.value === ROTATOR)
    ) {
      lessons = session.resolveChoice(0, ROTATOR)
    }
    expect(lessons.ok, lessons.error).toBe(true)
    // Immediate reap took 1 grain from (0, 2) and 1 grain from (0, 3) -> 2 grain in supply!
    expect(lessons.state.players[0]!.resources.grain).toBe(2)

    const sowPrompt =
      lessons.interaction.stateId === 'wait' && lessons.interaction.request.kind === 'choice'
        ? resolveNonSkipChoice(session, lessons)
        : lessons
    assert(
      sowPrompt.interaction.stateId === 'wait'
      && sowPrompt.interaction.request.kind === 'farm-select'
      && sowPrompt.interaction.request.farm.farmType === 'sow',
    )
    expect(sowPrompt.interaction.request.farm.selectableFields).toEqual([
      { tile: { row: 0, col: 2 }, allowedCrops: ['vegetable'] },
    ])

    // Already-empty (0, 4) and same-crop 'grain' on (0, 2) must both be rejected without mutating state!
    const rejectOtherEmpty = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 4, crop: 'vegetable' }],
    })
    expect(rejectOtherEmpty.ok).toBe(false)
    const rejectSameCrop = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(rejectSameCrop.ok).toBe(false)

    const sown = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'vegetable' }],
    })
    expect(sown.ok, sown.error).toBe(true)
    expect(sown.state.players[0]!.resources).toMatchObject({ grain: 2, vegetable: 0 })
    expect(sown.state.players[0]!.fields).toEqual([
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 1 }] },
      { row: 0, col: 4, stacks: [] },
    ])
    expect(sown.state.log.length).toBeGreaterThan(0)

    // Playing Crop Rotator with 0 planted fields completes cleanly without blocking:
    const emptyPlay = setup(1, (state) => {
      state.players[0]!.occupationHand = [ROTATOR]
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    })
    let emptyResp = emptyPlay.takeAction(0, 'lessons')
    if (
      emptyResp.interaction.stateId === 'wait'
      && sessionOptions(emptyResp).some((o) => o.value === ROTATOR)
    ) {
      emptyResp = emptyPlay.resolveChoice(0, ROTATOR)
    }
    expect(emptyResp.ok, emptyResp.error).toBe(true)
    expect(emptyResp.interaction.request.kind).toBe('confirm-next-player')
  })

  it('checks CWM077_EdibleRoots 3-field prerequisite including card fields, opens trigger-select with CWM014 on harvest, and skips single-crop Beanfield on CWM014', () => {
    // Subcase A: 2 farmyard fields is insufficient; adding 1 card field (Beanfield) satisfies "3 fields"!
    const tooFewFields = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [ROOTS]
      p0.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
      ]
    })
    const meetingNoPlay = tooFewFields.takeAction(0, 'meeting-place')
    expect(meetingNoPlay.interaction.request.kind).toBe('confirm-next-player')

    const withCardField = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [ROTATOR, 'A088_HedgeKeeper']
      p0.minorPlayed = [BEANFIELD]
      p0.minorHand = [ROOTS]
      p0.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
      ]
    })
    const playedRoots = playMinor(withCardField, ROOTS)
    expect(playedRoots.ok, playedRoots.error).toBe(true)
    expect(playedRoots.state.players[0]!.minorPlayed).toContain(ROOTS)

    // Subcase B: Sow Beanfield in Round 4 (2 veg), harvest in Round 4 (Beanfield 2->1 not empty; (0,2) 1->0 empty!),
    // then harvest in Round 7 (Beanfield 1->0 empty -> +1 food from Edible Roots, skipped by Crop Rotator!).
    const harvestSession = setup(4, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [ROTATOR, 'A088_HedgeKeeper']
      p0.minorPlayed = [ROOTS, BEANFIELD]
      Object.assign(p0.resources, { vegetable: 1, grain: 1, food: 10 })
      p0.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] },
      ]
    })

    // Sow 1 vegetable onto Beanfield via Grain Utilization (now Beanfield has 2 vegetable):
    const gu = harvestSession.takeAction(0, 'grain-utilization')
    const beanSowPrompt =
      gu.interaction.stateId === 'wait' && gu.interaction.request.kind === 'choice'
        ? harvestSession.resolveChoice(
            0,
            sessionOptions(gu).find((o) => o.value.includes('sow'))!.value,
          )
        : gu
    assert(
      beanSowPrompt.interaction.stateId === 'wait'
      && beanSowPrompt.interaction.request.kind === 'farm-select'
      && beanSowPrompt.interaction.request.farm.farmType === 'sow',
    )
    const beanTile = beanSowPrompt.interaction.request.farm.selectableFields.find(
      (f) => f.sourceCard === BEANFIELD,
    )!.tile
    const afterBeanSow = harvestSession.commitSelectionChoice(0, {
      crops: [{ row: beanTile.row, col: beanTile.col, crop: 'vegetable' }],
    })
    expect(afterBeanSow.ok, afterBeanSow.error).toBe(true)
    confirmTurns(harvestSession, afterBeanSow)

    for (const p of harvestSession.state.players) markAllWorkersUsed(harvestSession.state, p)
    const r4Harvest = harvestSession.performRoundEnd()
    expect(r4Harvest.ok, r4Harvest.error).toBe(true)

    // Both Crop Rotator (for emptied (0, 2)) and Edible Roots (1 emptied field) fire in trigger-select!
    const triggerOpts = sessionOptions(r4Harvest)
    expect(triggerOpts.map((o) => o.sourceCard)).toEqual(
      expect.arrayContaining([ROTATOR, ROOTS]),
    )

    // Pick Edible Roots first (+1 food: 10 -> 11, Beanfield still has 1 vegetable so NOT counted!), then undoStep back to trigger-select!
    const rootsTrigger = triggerOpts.find((o) => o.sourceCard === ROOTS)!
    const afterRootsFirst = harvestSession.resolveChoice(0, rootsTrigger.value)
    expect(afterRootsFirst.state.players[0]!.resources.food).toBe(11)

    const backToTriggerSelect = harvestSession.undoStep(0)
    expect(backToTriggerSelect.ok, backToTriggerSelect.error).toBe(true)
    expect(sessionOptions(backToTriggerSelect).map((o) => o.sourceCard)).toEqual(
      expect.arrayContaining([ROTATOR, ROOTS]),
    )

    // Now pick Crop Rotator first -> sow grain on (0, 2), then Edible Roots runs!
    const rotatorTrigger = sessionOptions(backToTriggerSelect).find((o) => o.sourceCard === ROTATOR)!
    let r4Next = harvestSession.resolveChoice(0, rotatorTrigger.value)
    if (r4Next.interaction.stateId === 'wait' && r4Next.interaction.request.kind === 'choice') {
      r4Next = resolveNonSkipChoice(harvestSession, r4Next)
    }
    r4Next = harvestSession.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    // Remaining trigger (Edible Roots) in manual mode -> +1 food (11) then Round 4 feeding (-4 food) = 7 food!
    const remainingRoots = sessionOptions(r4Next).find((o) => o.sourceCard === ROOTS)
    if (remainingRoots) {
      r4Next = harvestSession.resolveChoice(0, remainingRoots.value)
    }
    expect(r4Next.state.players[0]!.resources.food).toBe(7)
    expect(
      r4Next.state.events.some(
        (e) => e.type === 'resource.moved' && e.sourceCardId === ROOTS && e.resources.food === 1,
      ),
    ).toBe(true)
    expect(r4Next.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])

    // Round 7 Harvest: Beanfield now has 1 vegetable left (and (0,2)/(0,3) have >= 2 grain), player has 1 grain:
    // Beanfield empties (1 -> 0) -> Edible Roots awards +1 food, while Crop Rotator skips Beanfield (cannot sow grain on Beanfield)!
    const r7Session = setup(7, (state) => {
      state.players[0]!.occupationPlayed = [ROTATOR, 'A088_HedgeKeeper']
      state.players[0]!.minorPlayed = [ROOTS, BEANFIELD]
      state.players[0]!.cardStates = structuredClone(r4Next.state.players[0]!.cardStates)
      Object.assign(state.players[0]!.resources, { grain: 1, vegetable: 0, food: 10 })
      state.players[0]!.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
        { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 2 }] },
      ]
    })
    for (const p of r7Session.state.players) markAllWorkersUsed(r7Session.state, p)
    let r7Harvest = r7Session.performRoundEnd()
    // Crop Rotator must NOT offer sow on Beanfield; only Edible Roots (+1 food -> 11 before feeding, or feeding after)!
    expect(sessionOptions(r7Harvest).some((o) => o.sourceCard === ROTATOR)).toBe(false)
    const r7Roots = sessionOptions(r7Harvest).find((o) => o.sourceCard === ROOTS)
    if (r7Roots) {
      r7Harvest = r7Session.resolveChoice(0, r7Roots.value)
    }
    // 10 initial + 1 Edible Roots - 4 feeding = 7 food (or 11 if paused before feeding)
    expect([7, 11]).toContain(r7Harvest.state.players[0]!.resources.food)
  })

  it('stays silent when no field is emptied or when the opposite seed is unavailable', () => {
    const session = setup(4, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [ROTATOR]
      p0.minorPlayed = [ROOTS]
      Object.assign(p0.resources, { grain: 0, vegetable: 0, food: 10 })
      p0.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] },
        { row: 0, col: 3, stacks: [] },
        { row: 0, col: 4, stacks: [] },
      ]
    })
    for (const p of session.state.players) markAllWorkersUsed(session.state, p)
    const afterHarvest = session.performRoundEnd()
    // 10 food - 4 feeding = 6 food (0 Edible Roots food), and no Crop Rotator prompt!
    expect(afterHarvest.state.players[0]!.resources.food).toBe(6)
    expect(
      afterHarvest.state.events.some(
        (e) => e.type === 'resource.moved' && e.sourceCardId === ROOTS,
      ),
    ).toBe(false)
  })

  it('triggers CWM014 on non-reap crop removal (A070_LiftingMachine), leaves stone fields untouched on play, and isolates CWM077 field deltas per player', () => {
    // 1. Non-reap removal: A070_LiftingMachine removes the last vegetable at end of Round 1 -> CWM014 offers grain sow!
    const liftingSession = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [ROTATOR]
      p0.minorPlayed = ['A070_LiftingMachine']
      Object.assign(p0.resources, { grain: 1, vegetable: 0 })
      p0.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 3, stacks: [] },
        { row: 0, col: 4, stacks: [] },
      ]
    })
    for (const p of liftingSession.state.players) markAllWorkersUsed(liftingSession.state, p)
    const r1End = liftingSession.performRoundEnd()
    if (r1End.interaction.stateId === 'wait' && r1End.interaction.request.kind === 'choice') {
      resolveNonSkipChoice(liftingSession, r1End)
    }
    let afterLift = liftingSession.commitSelectionChoice(0, { positions: ['0-2'] })
    expect(afterLift.ok, afterLift.error).toBe(true)
    expect(afterLift.state.players[0]!.resources.vegetable).toBe(1)
    if (afterLift.interaction.stateId === 'wait' && afterLift.interaction.request.kind === 'choice') {
      afterLift = resolveNonSkipChoice(liftingSession, afterLift)
    }
    assert(
      afterLift.interaction.stateId === 'wait'
      && afterLift.interaction.request.kind === 'farm-select'
      && afterLift.interaction.request.farm.farmType === 'sow',
    )
    expect(afterLift.interaction.request.farm.selectableFields).toEqual([
      { tile: { row: 0, col: 2 }, allowedCrops: ['grain'] },
    ])
    const afterRotateSow = liftingSession.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(afterRotateSow.ok, afterRotateSow.error).toBe(true)
    expect(afterRotateSow.state.players[0]!.fields[0]!.stacks).toEqual([
      { kind: 'grain', remaining: 3 },
    ])

    // 2. Playing CWM014 with a stone-bearing field (C006_StoneClearing) takes ONLY grain/vegetable and leaves stone on field!
    const stoneFieldSession = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.occupationHand = [ROTATOR]
      p0.minorPlayed = ['C006_StoneClearing']
      Object.assign(p0.resources, { grain: 0, vegetable: 0, stone: 0 })
      p0.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 1 }] },
        { row: 0, col: 3, stacks: [{ kind: 'stone', remaining: 1 }] },
      ]
    })
    let playedWithStone = stoneFieldSession.takeAction(0, 'lessons')
    if (
      playedWithStone.interaction.stateId === 'wait'
      && sessionOptions(playedWithStone).some((o) => o.value === ROTATOR)
    ) {
      playedWithStone = stoneFieldSession.resolveChoice(0, ROTATOR)
    }
    expect(playedWithStone.ok, playedWithStone.error).toBe(true)
    expect(playedWithStone.state.players[0]!.resources).toMatchObject({ grain: 1, stone: 0 })
    expect(playedWithStone.state.players[0]!.fields).toEqual([
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [{ kind: 'stone', remaining: 1 }] },
    ])

    // 3. Cross-player Round 4 harvest: Player 0 (Crop Rotator) sows (0, 2) before Player 1 (Edible Roots) resolves (0, 2)!
    const crossPlayer = setup(4, (state) => {
      const p0 = state.players[0]!
      const p1 = state.players[1]!
      p0.occupationPlayed = [ROTATOR]
      Object.assign(p0.resources, { grain: 1, vegetable: 0, food: 10 })
      p0.fields = [{ row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] }]

      p1.minorPlayed = [ROOTS]
      Object.assign(p1.resources, { grain: 0, vegetable: 0, food: 10 })
      p1.fields = [
        { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
        { row: 0, col: 3, stacks: [] },
        { row: 0, col: 4, stacks: [] },
      ]
    })
    for (const p of crossPlayer.state.players) markAllWorkersUsed(crossPlayer.state, p)
    const initialHarvest = crossPlayer.performRoundEnd()
    if (
      initialHarvest.interaction.stateId === 'wait'
      && initialHarvest.interaction.playerIndex === 0
      && initialHarvest.interaction.request.kind === 'choice'
    ) {
      resolveNonSkipChoice(crossPlayer, initialHarvest)
    }
    let crossHarvest = crossPlayer.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    if (
      crossHarvest.interaction.stateId === 'wait'
      && crossHarvest.interaction.request.kind === 'confirm-player-switch'
    ) {
      crossHarvest = crossPlayer.confirmPlayerSwitch(crossHarvest.interaction.request.fromPlayerIndex)
    }
    const p1Roots = sessionOptions(crossHarvest).find((o) => o.sourceCard === ROOTS)
    if (p1Roots) {
      crossHarvest = crossPlayer.resolveChoice(1, p1Roots.value)
    }
    // Player 1 had 10 food + 1 Edible Roots - 4 feeding = 7 food!
    expect(crossHarvest.state.players[1]!.resources.food).toBe(7)
  })
})
