import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { CWM048_SundayWorker } from '../../shared/cards/classic/CWM/CWM048_SundayWorker'
import type { GameState } from '../../shared/contract/types'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'
import { resolveNonSkipChoice, resolveTriggerIfPresent, withManualReactionOrder } from './_helpers/trigger-select'

const SUNDAY_WORKER = 'CWM048_SundayWorker'
const HILL_FARMER = 'CWM029_HillFarmer'
const ELDER = 'CFL032_Elder'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession(
    withManualReactionOrder({
      seed: 4801,
      configure: (state) => {
        state.round = round
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

describe('CWM048_SundayWorker session', () => {
  it('declares 3+ player count, doubles accumulated goods/food once in round 7 and again in round 14, and allows paying with newly collected food', () => {
    expect(CWM048_SundayWorker.meta.players).toBe('3+')

    const session = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [SUNDAY_WORKER]
      p0.resources.food = 2
      p0.resources.wood = 0
      state.actionSpaces.find((s) => s.id === 'forest')!.resources.wood = 6
      state.actionSpaces.find((s) => s.id === 'clay-pit')!.resources.clay = 3
    })

    // First worker in round 7 visits Forest (6 wood):
    const forestResp = session.takeAction(0, 'forest')
    expect(forestResp.ok, forestResp.error).toBe(true)
    expect(forestResp.state.players[0]!.resources.wood).toBe(6)
    expect(forestResp.interaction).toMatchObject({
      stateId: 'wait',
      sourceCard: SUNDAY_WORKER,
    })

    const doubled = resolveNonSkipChoice(session, forestResp)
    expect(doubled.ok, doubled.error).toBe(true)
    expect(doubled.state.players[0]!.resources).toMatchObject({ food: 1, wood: 12 })
    expect(doubled.state.actionSpaces.find((s) => s.id === 'forest')!.resources.wood).toBe(0)
    expect(doubled.state.players[0]!.cardStates[SUNDAY_WORKER]?.extraData?.usedRound).toBe(7)
    const woodCollects = doubled.state.events.filter(
      (e) =>
        e.type === 'resource.moved'
        && e.reason === 'collect'
        && e.from.kind === 'actionSpace'
        && e.from.spaceId === 'forest',
    )
    expect(woodCollects).toHaveLength(2)

    // Second worker in round 7 visits Clay Pit -> Sunday Worker does NOT fire a second time in round 7!
    confirmTurns(session, doubled)
    const opp = session.takeAction(1, 'day-laborer')
    confirmTurns(session, opp)
    const clayResp = session.takeAction(0, 'clay-pit')
    expect(clayResp.ok, clayResp.error).toBe(true)
    expect(clayResp.state.players[0]!.resources.clay).toBe(3)
    expect(clayResp.interaction.request.kind).toBe('confirm-next-player')

    // Round 14 with 0 initial food + 2 food on Fishing: food collected on the first use can fund Sunday Worker!
    const round14 = setup(14, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [SUNDAY_WORKER]
      p0.cardStates[SUNDAY_WORKER] = { extraData: { usedRound: 7 } }
      p0.resources.food = 0
      state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 2
    })
    const fishFirst = round14.takeAction(0, 'fishing')
    expect(fishFirst.state.players[0]!.resources.food).toBe(2)
    expect(fishFirst.interaction).toMatchObject({ stateId: 'wait', sourceCard: SUNDAY_WORKER })
    const fishDoubled = resolveNonSkipChoice(round14, fishFirst)
    expect(fishDoubled.ok, fishDoubled.error).toBe(true)
    // 2 collected - 1 paid + 2 collected = 3 food!
    expect(fishDoubled.state.players[0]!.resources.food).toBe(3)
    expect(fishDoubled.state.players[0]!.cardStates[SUNDAY_WORKER]?.extraData?.usedRound).toBe(14)
  })

  it('re-evaluates live state in the same after window so Hill Farmer food enables Sunday Worker to plow a second field', () => {
    const session = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [HILL_FARMER, SUNDAY_WORKER]
      p0.resources.food = 0
    })

    const farmland = session.takeAction(0, 'farmland')
    assert(farmland.interaction.stateId === 'wait' && farmland.interaction.request.kind === 'farm-select')
    let step = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(step.ok, step.error).toBe(true)

    // Hill Farmer grants 2 food for plowing with a 2-room house; trigger it first if select-trigger appears:
    if (step.interaction.stateId === 'wait' && step.interaction.request.kind === 'select-trigger') {
      const hillOpt = sessionOptions(step).find((o) => o.sourceCard === HILL_FARMER || o.value === HILL_FARMER)
      if (hillOpt) step = session.resolveChoice(0, hillOpt.value)
    }
    // Now player has 2 food, so Sunday Worker is offered!
    if (step.interaction.stateId === 'wait' && step.interaction.request.kind === 'select-trigger') {
      const sundayOpt = sessionOptions(step).find((o) => o.sourceCard === SUNDAY_WORKER || o.value === SUNDAY_WORKER)
      if (sundayOpt) step = session.resolveChoice(0, sundayOpt.value)
    }
    expect(step.interaction).toMatchObject({ stateId: 'wait', sourceCard: SUNDAY_WORKER })
    const secondPlowPrompt = resolveNonSkipChoice(session, step)
    assert(
      secondPlowPrompt.interaction.stateId === 'wait'
      && secondPlowPrompt.interaction.request.kind === 'farm-select'
      && secondPlowPrompt.interaction.request.farm.farmType === 'plow',
    )
    let afterSecondPlow = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    while (
      afterSecondPlow.interaction.stateId === 'wait'
      && afterSecondPlow.interaction.request.kind === 'select-trigger'
    ) {
      const nextOpt = sessionOptions(afterSecondPlow).find((o) => !o.disabled && o.value !== '__pass__')
      if (!nextOpt) break
      afterSecondPlow = session.resolveChoice(0, nextOpt.value)
    }
    expect(afterSecondPlow.ok, afterSecondPlow.error).toBe(true)
    expect(afterSecondPlow.state.players[0]!.fields).toHaveLength(2)
    // 0 + 2 (Hill Farmer #1) - 1 (Sunday Worker) + 2 (Hill Farmer #2) = 3 food
    expect(afterSecondPlow.state.players[0]!.resources.food).toBe(3)
  })

  it('stays silent outside rounds 7/14, on worker-less card jumps, and when target cannot execute again after paying 1 food', () => {
    // 1. Round 6 and Round 8 stay silent.
    for (const round of [6, 8]) {
      const s = setup(round, (state) => {
        state.players[0]!.occupationPlayed = [SUNDAY_WORKER]
        state.actionSpaces.find((sp) => sp.id === 'forest')!.resources.wood = 3
      })
      const r = s.takeAction(0, 'forest')
      expect(r.ok, r.error).toBe(true)
      expect(r.interaction.request.kind).toBe('confirm-next-player')
    }

    // 2. Worker-less use via Elder in Round 7 does NOT trigger Sunday Worker ("one of your peoples' actions").
    const elderSession = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [ELDER, SUNDAY_WORKER]
      p0.cardStates[ELDER] = { counters: { food: 1 } }
      p0.resources.food = 10
      state.actionSpaces.find((sp) => sp.id === 'fishing')!.resources.food = 2
      for (const player of state.players) markAllWorkersUsed(state, player)
    })
    const elderMenu = resolveTriggerIfPresent(elderSession, elderSession.performRoundEnd(), ELDER)
    const elderFished = resolveNonSkipChoice(elderSession, elderMenu)
    expect(elderFished.ok, elderFished.error).toBe(true)
    expect(elderFished.state.events).toContainEqual(
      expect.objectContaining({
        type: 'actionSpace.useStarted',
        spaceId: 'fishing',
        newPlacement: false,
        round: 7,
      }),
    )
    expect(elderFished.interaction.sourceCard).not.toBe(SUNDAY_WORKER)
    expect(elderFished.state.players[0]!.cardStates[SUNDAY_WORKER]?.extraData?.usedRound).toBeUndefined()

    // 3. Admission check: playing the LAST occupation in hand on Lessons in Round 7 leaves no second occupation to play,
    // so Sunday Worker must NOT prompt a dead-end 1-food offer!
    const lastOccSession = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = []
      p0.occupationHand = [SUNDAY_WORKER]
      p0.resources.food = 2
    })
    const lessons = lastOccSession.takeAction(0, 'lessons')
    const playedLast =
      lessons.interaction.stateId === 'wait' && sessionOptions(lessons).some((o) => o.value === SUNDAY_WORKER)
        ? lastOccSession.resolveChoice(0, SUNDAY_WORKER)
        : lessons
    expect(playedLast.ok, playedLast.error).toBe(true)
    expect(playedLast.state.players[0]!.occupationPlayed).toEqual([SUNDAY_WORKER])
    expect(playedLast.interaction.request.kind).toBe('confirm-next-player')
  })
})
