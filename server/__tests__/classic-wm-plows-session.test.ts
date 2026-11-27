import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveNonSkipChoice } from './_helpers/trigger-select'

const IRON_PLOW = 'CWM091_IronPlow'
const ROTHERHAM_PLOW = 'CWM105_RotherhamPlow'
const STEEL_PLOW = 'CWM109_SteelPlow'
const DONKEY = 'CWM074_Donkey'
const SUNDAY_WORKER = 'CWM048_SundayWorker'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 9101,
    configure: (state) => {
      state.round = round
      const cultIdx = state.roundActionOrder.indexOf('cultivation')
      if (cultIdx >= 0 && round >= 5) {
        state.roundActionOrder[cultIdx] = state.roundActionOrder[0]!
        state.roundActionOrder[0] = 'cultivation'
      }
      for (const player of state.players) {
        player.resources.food = 10
        setWorkersAtHome(state, player, 2)
      }
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

describe('classic WM plows (CWM091, CWM105, CWM109) session', () => {
  it('CWM091_IronPlow replaces Farmland once per game to plow 2 fields and sow afterward, and stays silent thereafter', () => {
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [IRON_PLOW]
      Object.assign(p0.resources, { grain: 1, vegetable: 1 })
    })

    const farmland = session.takeAction(0, 'farmland')
    expect(farmland.ok, farmland.error).toBe(true)
    const opts = sessionOptions(farmland)
    const ironOption = opts.find((o) => o.sourceCard === IRON_PLOW || o.labelKey === `cards.${IRON_PLOW}.name`)!
    expect(ironOption).toBeDefined()

    const plow1 = session.resolveChoice(0, ironOption.value)
    assert(plow1.interaction.stateId === 'wait' && plow1.interaction.request.kind === 'farm-select')
    const plow2 = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    assert(plow2.interaction.stateId === 'wait' && plow2.interaction.request.kind === 'farm-select')
    const afterPlows = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })

    // Optional Sow prompt or direct sow farm-select
    let sowWait = afterPlows
    if (sowWait.interaction.stateId === 'wait' && sowWait.interaction.request.kind === 'choice') {
      const sowChoice = sessionOptions(sowWait).find((o) => o.value !== '__skip__')!
      sowWait = session.resolveChoice(0, sowChoice.value)
    }
    assert(
      sowWait.interaction.stateId === 'wait'
      && sowWait.interaction.request.kind === 'farm-select'
      && sowWait.interaction.request.farm.farmType === 'sow',
    )
    const done = session.commitSelectionChoice(0, {
      crops: [
        { row: 0, col: 2, crop: 'grain' },
        { row: 0, col: 3, crop: 'vegetable' },
      ],
    })
    expect(done.ok, done.error).toBe(true)
    const p0 = done.state.players[0]!
    expect(p0.cardStates[IRON_PLOW]?.flagged).toBe(true)
    expect(p0.fields).toEqual([
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ])

    // Once per game: when Farmland is freed in a later use, Iron Plow is no longer offered.
    done.state.actionSpaces.find((s) => s.id === 'farmland')!.takenBy = []
    confirmTurns(session, done)
    const opp = session.takeAction(1, 'day-laborer')
    confirmTurns(session, opp)
    const secondFarmland = session.takeAction(0, 'farmland')
    expect(secondFarmland.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })
  })

  it('CWM105_RotherhamPlow stays silent with 0 fields, rejects orthogonally and diagonally adjacent second tiles, and accepts non-adjacent connected pairs', () => {
    // 0 fields: cannot form two non-adjacent new fields that remain orthogonally connected!
    const zeroFields = setup(1, (state) => {
      state.players[0]!.minorPlayed = [ROTHERHAM_PLOW]
      state.players[0]!.fields = []
    })
    const directPlow = zeroFields.takeAction(0, 'farmland')
    expect(directPlow.interaction).toMatchObject({
      stateId: 'wait',
      request: { kind: 'farm-select', farm: { farmType: 'plow' } },
    })

    // Existing fields at (0, 2) and (0, 3): (0, 1) and (0, 4) are both orthogonally connected to existing fields and distance 3 apart!
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [ROTHERHAM_PLOW]
      p0.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
      ]
    })

    const farmland = session.takeAction(0, 'farmland')
    const rotherhamOpt = sessionOptions(farmland).find(
      (o) => o.sourceCard === ROTHERHAM_PLOW || o.labelKey === `cards.${ROTHERHAM_PLOW}.name`,
    )!
    expect(rotherhamOpt).toBeDefined()

    const firstStep = session.resolveChoice(0, rotherhamOpt.value)
    assert(firstStep.interaction.stateId === 'wait' && firstStep.interaction.request.kind === 'farm-select')
    const secondStep = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    assert(
      secondStep.interaction.stateId === 'wait'
      && secondStep.interaction.request.kind === 'farm-select'
      && secondStep.interaction.request.farm.farmType === 'plow',
    )
    // Diagonally adjacent (1, 2) must NOT be in selectableTiles and must be rejected if submitted!
    expect(secondStep.interaction.request.farm.selectableTiles).not.toContainEqual({ row: 1, col: 2 })
    const rejectedDiag = session.commitSelectionChoice(0, { tile: { row: 1, col: 2 } })
    expect(rejectedDiag.ok).toBe(false)
    expect(rejectedDiag.state.players[0]!.fields).toHaveLength(3)

    const accepted = session.commitSelectionChoice(0, { tile: { row: 0, col: 4 } })
    expect(accepted.ok, accepted.error).toBe(true)
    expect(accepted.state.players[0]!.fields.map((f) => `${f.row}-${f.col}`).sort()).toEqual([
      '0-1',
      '0-2',
      '0-3',
      '0-4',
    ])
  })

  it('CWM109_SteelPlow does not prompt on Cultivation sow-only, stops cleanly after 2 fields with one skip, and continues to Cultivation sow', () => {
    // Subcase A: Cultivation sow-only never prompts Steel Plow.
    const sowOnly = setup(5, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [STEEL_PLOW]
      p0.fields = [{ row: 0, col: 2, stacks: [] }]
      p0.resources.grain = 1
    })
    const cultSow = sowOnly.takeAction(0, 'cultivation')
    const sowBranch = sessionOptions(cultSow).find((o) => o.value.includes('sow'))!
    const sowSelect = sowOnly.resolveChoice(0, sowBranch.value)
    assert(
      sowSelect.interaction.stateId === 'wait'
      && sowSelect.interaction.request.kind === 'farm-select'
      && sowSelect.interaction.request.farm.farmType === 'sow',
    )
    const sowDone = sowOnly.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(sowDone.ok, sowDone.error).toBe(true)
    expect(sowDone.state.players[0]!.cardStates[STEEL_PLOW]?.flagged).toBeFalsy()

    // Subcase B: Cultivation plow -> Steel Plow -> plow 2 fields -> skip once -> sow!
    const session = setup(5, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [STEEL_PLOW]
      p0.fields = [{ row: 0, col: 2, stacks: [] }]
      p0.resources.grain = 1
    })
    const cult = session.takeAction(0, 'cultivation')
    const plowBranch = sessionOptions(cult).find((o) => o.value.includes('plow'))!
    const replaceMenu = session.resolveChoice(0, plowBranch.value)
    const steelOpt = sessionOptions(replaceMenu).find(
      (o) => o.sourceCard === STEEL_PLOW || o.labelKey === `cards.${STEEL_PLOW}.name`,
    )!
    expect(steelOpt).toBeDefined()

    const step1 = session.resolveChoice(0, steelOpt.value)
    assert(step1.interaction.stateId === 'wait' && step1.interaction.request.kind === 'farm-select')
    const after1 = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    // Accept 2nd plow
    const opt2 = sessionOptions(after1).find((o) => o.value !== '__skip__')!
    session.resolveChoice(0, opt2.value)
    session.commitSelectionChoice(0, { tile: { row: 0, col: 4 } })

    // Skip on 3rd optional plow must skip the remaining plow chain in ONE click and move directly to Cultivation's remaining Sow option!
    const afterSkip = session.resolveChoice(0, '__skip__')
    expect(afterSkip.ok, afterSkip.error).toBe(true)
    expect(afterSkip.state.players[0]!.fields).toHaveLength(3)
    expect(afterSkip.state.players[0]!.cardStates[STEEL_PLOW]?.flagged).toBe(true)
    // Cultivation's OR node now offers Sow (or __skip__)
    const remainingSow = sessionOptions(afterSkip).find((o) => o.value.includes('sow'))!
    expect(remainingSow).toBeDefined()
    session.resolveChoice(0, remainingSow.value)
    const finalResp = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'grain' }] })
    expect(finalResp.ok, finalResp.error).toBe(true)
    expect(finalResp.state.players[0]!.fields).toHaveLength(3)
  })

  it('keeps multiple "instead of 1" plows mutually exclusive via XOR while allowing an "additional" plow (CWM074_Donkey) to stack', () => {
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [IRON_PLOW, ROTHERHAM_PLOW, STEEL_PLOW, DONKEY]
      p0.fields = [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 3, stacks: [] },
      ]
    })

    const start = session.takeAction(0, 'farmland')
    // Donkey's `before` optional additional plow runs before the base `plow` leaf's `computeReplace` XOR:
    const donkeyAccept = sessionOptions(start).find((o) => o.value !== '__skip__')!
    session.resolveChoice(0, donkeyAccept.value)
    const afterDonkey = session.commitSelectionChoice(0, { tile: { row: 1, col: 2 } })

    // Now the base `plow` leaf offers XOR between base plow, Iron Plow, Rotherham Plow, and Steel Plow!
    const replaceChoices = sessionOptions(afterDonkey)
    const labelKeys = replaceChoices.map((o) => o.labelKey)
    expect(labelKeys).toEqual(
      expect.arrayContaining([
        `cards.${IRON_PLOW}.name`,
        `cards.${ROTHERHAM_PLOW}.name`,
        `cards.${STEEL_PLOW}.name`,
      ]),
    )

    const rotherham = replaceChoices.find((o) => o.labelKey === `cards.${ROTHERHAM_PLOW}.name`)!
    session.resolveChoice(0, rotherham.value)
    session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    const done = session.commitSelectionChoice(0, { tile: { row: 0, col: 4 } })
    expect(done.ok, done.error).toBe(true)
    // 2 initial + 1 Donkey additional + 2 Rotherham replacement = 5 fields total; Iron & Steel Plows stay unflagged!
    expect(done.state.players[0]!.fields).toHaveLength(5)
    expect(done.state.players[0]!.cardStates[IRON_PLOW]?.flagged).toBeFalsy()
    expect(done.state.players[0]!.cardStates[STEEL_PLOW]?.flagged).toBeFalsy()
  })

  it('offers Rotherham, Iron, and Steel Plow replacements on card-granted uses of Farmland such as Sunday Worker', () => {
    const session = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [SUNDAY_WORKER]
      p0.minorPlayed = [IRON_PLOW, ROTHERHAM_PLOW, STEEL_PLOW]
      p0.fields = [
        { row: 1, col: 2, stacks: [] },
        { row: 1, col: 3, stacks: [] },
      ]
    })

    // First Farmland use: choose Rotherham Plow to plow (0, 2) and (2, 3) (non-adjacent).
    const firstFarmland = session.takeAction(0, 'farmland')
    const firstRotherham = sessionOptions(firstFarmland).find(
      (o) => o.labelKey === `cards.${ROTHERHAM_PLOW}.name`,
    )!
    expect(firstRotherham).toBeDefined()
    session.resolveChoice(0, firstRotherham.value)
    session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    const afterFirstUse = session.commitSelectionChoice(0, { tile: { row: 2, col: 3 } })
    expect(afterFirstUse.ok, afterFirstUse.error).toBe(true)
    expect(afterFirstUse.state.players[0]!.fields).toHaveLength(4)
    expect(afterFirstUse.interaction).toMatchObject({
      stateId: 'wait',
      sourceCard: SUNDAY_WORKER,
    })

    // Accept Sunday Worker (1 food) to repeat Farmland: all three WM plows must be offered on the repeated space use!
    const repeatedUse = resolveNonSkipChoice(session, afterFirstUse)
    expect(repeatedUse.ok, repeatedUse.error).toBe(true)
    const repeatedLabels = sessionOptions(repeatedUse).map((o) => o.labelKey)
    expect(repeatedLabels).toEqual(
      expect.arrayContaining([
        `cards.${IRON_PLOW}.name`,
        `cards.${ROTHERHAM_PLOW}.name`,
        `cards.${STEEL_PLOW}.name`,
      ]),
    )

    // Choose Rotherham Plow again on the repeated Farmland use to plow (1, 1) and (1, 4) -> 6 fields total!
    const secondRotherham = sessionOptions(repeatedUse).find(
      (o) => o.labelKey === `cards.${ROTHERHAM_PLOW}.name`,
    )!
    session.resolveChoice(0, secondRotherham.value)
    session.commitSelectionChoice(0, { tile: { row: 1, col: 1 } })
    const done = session.commitSelectionChoice(0, { tile: { row: 1, col: 4 } })
    expect(done.ok, done.error).toBe(true)
    expect(done.state.players[0]!.resources.food).toBe(9)
    expect(done.state.players[0]!.fields.map((f) => `${f.row}-${f.col}`).sort()).toEqual([
      '0-2',
      '1-1',
      '1-2',
      '1-3',
      '1-4',
      '2-3',
    ])
    expect(done.state.players[0]!.cardStates[IRON_PLOW]?.flagged).toBeFalsy()
    expect(done.state.players[0]!.cardStates[STEEL_PLOW]?.flagged).toBeFalsy()
  })
})
