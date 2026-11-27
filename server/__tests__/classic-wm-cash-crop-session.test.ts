import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { deriveVirtualTileCol, getLogicalFields, mutateLogicalFields } from '../../shared/cards/helpers/card-field'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { choose } from './_helpers/card-play-lifecycle'
import { playMinor } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { autoAdvanceRoundEnd } from './_helpers/round-end'
import { createWorkSession } from './_helpers/session-fixtures'

const CASH_CROP = 'CWM068_CashCrop'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 6801,
    configure: (state) => {
      state.round = round
      const grainIdx = state.roundActionOrder.indexOf('grain-utilization')
      assert(grainIdx >= 0)
      state.roundActionOrder[grainIdx] = state.roundActionOrder[0]!
      state.roundActionOrder[0] = 'grain-utilization'
      for (const player of state.players) {
        player.resources.food = 12
        setWorkersAtHome(state, player, 2)
      }
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

function offeredMinorsOnMeetingPlace(session: GameSession): string[] {
  const meeting = session.takeAction(0, 'meeting-place')
  if (meeting.interaction.stateId !== 'wait') return []
  const options = meeting.interaction.request.options ?? []
  const branch = options.find((opt) => opt.value.startsWith('action-improvement-'))
  const cardMenu = branch ? choose(session, meeting, branch.value) : meeting
  if (cardMenu.interaction.stateId !== 'wait') return []
  return (cardMenu.interaction.request.options ?? [])
    .filter((opt) => !opt.disabled)
    .map((opt) => opt.value)
}

const scoreCategory = (response: SessionResponse, key: string) =>
  response.scores?.[0]?.categories.find((category) => category.key === key)

describe('CWM068_CashCrop session', () => {
  it('plays for free with 1 occupation, sows on its virtual card field, and mandatorily converts harvest-reaped goods into bonus VP', () => {
    const virtualCol = deriveVirtualTileCol(CASH_CROP, 0)
    const session = setup(4, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [CASH_CROP]
      p0.occupationPlayed = ['A088_HedgeKeeper']
      p0.resources.grain = 1
    })

    const played = playMinor(session, CASH_CROP)
    expect(played.ok, played.error).toBe(true)
    expect(played.state.players[0]!.minorPlayed).toContain(CASH_CROP)
    expect(played.state.players[0]!.resources.food).toBe(12)

    confirmTurns(session, played)
    const oppTurn = session.takeAction(1, 'day-laborer')
    expect(oppTurn.ok, oppTurn.error).toBe(true)
    confirmTurns(session, oppTurn)

    const sowStep = session.takeAction(0, 'grain-utilization')
    expect(sowStep.ok, sowStep.error).toBe(true)
    assert(
      sowStep.interaction.stateId === 'wait'
      && sowStep.interaction.request.kind === 'farm-select'
      && sowStep.interaction.request.farm.farmType === 'sow',
    )
    expect(sowStep.interaction.request.farm.selectableFields).toContainEqual(
      expect.objectContaining({
        tile: { row: -1, col: virtualCol },
        sourceCard: CASH_CROP,
        allowedCrops: ['grain'],
      }),
    )

    const sown = session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: virtualCol, crop: 'grain' }],
    })
    expect(sown.ok, sown.error).toBe(true)
    expect(sown.state.players[0]!.resources.grain).toBe(0)
    const fieldsAfterSow = session.withCtx(() => getLogicalFields(session.state.players[0]!))
    expect(fieldsAfterSow.find((f) => f.sourceCard === CASH_CROP)?.stacks).toEqual([
      { kind: 'grain', remaining: 3 },
    ])
    expect(sown.state.log.length).toBeGreaterThan(0)

    stateReadyForHarvest(session.state)
    const harvest = autoAdvanceRoundEnd(session)
    expect(harvest.ok, harvest.error).toBe(true)

    const p0After = harvest.state.players[0]!
    expect(p0After.resources.grain).toBe(0)
    expect(p0After.cardStates[CASH_CROP]?.counters?.bonusVp).toBe(1)
    const fieldsAfterHarvest = session.withCtx(() => getLogicalFields(p0After))
    expect(fieldsAfterHarvest.find((f) => f.sourceCard === CASH_CROP)?.stacks).toEqual([
      { kind: 'grain', remaining: 2 },
    ])

    const paid = harvest.state.events.find(
      (event) => event.type === 'resource.paid' && event.sourceCardId === CASH_CROP,
    )
    expect(paid).toMatchObject({ resources: { grain: 1 } })

    expect(scoreCategory(harvest, 'fields')?.quantity).toBe(0)
    expect(scoreCategory(harvest, 'grains')?.quantity).toBe(2)
    expect(scoreCategory(harvest, 'cardBonusVp')?.entries).toContainEqual(
      expect.objectContaining({ type: 'bonus', cardId: CASH_CROP, score: 1 }),
    )
  })

  it('converts only crops harvested from Cash Crop while leaving ordinary farmyard harvests in supply', () => {
    const virtualCol = deriveVirtualTileCol(CASH_CROP, 0)
    const session = setup(4, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = ['A088_HedgeKeeper']
      p0.minorPlayed = [CASH_CROP]
      p0.fields = [{ row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 2 }] }]
      p0.resources.vegetable = 1
    })

    const sowStep = session.takeAction(0, 'grain-utilization')
    assert(sowStep.interaction.stateId === 'wait' && sowStep.interaction.request.kind === 'farm-select')
    const sown = session.commitSelectionChoice(0, {
      crops: [{ row: -1, col: virtualCol, crop: 'vegetable' }],
    })
    expect(sown.ok, sown.error).toBe(true)

    stateReadyForHarvest(session.state)
    const harvest = autoAdvanceRoundEnd(session)
    expect(harvest.ok, harvest.error).toBe(true)
    const p0 = harvest.state.players[0]!
    expect(p0.resources.grain).toBe(1)
    expect(p0.resources.vegetable).toBe(0)
    expect(p0.cardStates[CASH_CROP]?.counters?.bonusVp).toBe(1)
  })

  it('requires 1 played occupation to play and does not award bonus VP on non-harvest crop removal', () => {
    const withoutOcc = setup(4, (state) => {
      state.players[0]!.minorHand = [CASH_CROP]
      state.players[0]!.occupationPlayed = []
    })
    expect(offeredMinorsOnMeetingPlace(withoutOcc)).not.toContain(CASH_CROP)

    const nonHarvest = setup(4, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = ['A088_HedgeKeeper']
      p0.minorPlayed = [CASH_CROP]
      p0.cardStates[CASH_CROP] = {
        extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: 2 }] },
      }
    })
    const removed = nonHarvest.withCtx(() =>
      mutateLogicalFields(nonHarvest.state, nonHarvest.state.players[0]!, {
        reason: 'reap',
        trigger: { phase: 'private-field-phase' },
      }).remove({ fieldId: `card:${CASH_CROP}`, slot: 0 }, 1),
    )
    expect(removed).toMatchObject({ ok: true, crop: 'vegetable', amount: 1 })
    expect(removed.ok && removed.flow).toBeUndefined()
    expect(nonHarvest.state.players[0]!.cardStates[CASH_CROP]?.counters?.bonusVp ?? 0).toBe(0)
  })
})

function stateReadyForHarvest(state: GameState) {
  for (const player of state.players) {
    markAllWorkersUsed(state, player)
  }
}
