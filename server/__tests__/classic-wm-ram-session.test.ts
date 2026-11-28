import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import { CWM102_Ram } from '../../shared/cards/classic/CWM/CWM102_Ram'
import type { GameState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'
import { withManualReactionOrder } from './_helpers/trigger-select'

const RAM = CWM102_Ram.meta.id

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function addSheepPasture(state: GameState, sheepCount: number) {
  const p0 = state.players[0]!
  p0.resources.sheep = sheepCount
  p0.pastures = [
    {
      id: 'pasture-1',
      tiles: [
        { row: 0, col: 1 },
        { row: 0, col: 2 },
      ],
      animalType: sheepCount > 0 ? 'sheep' : null,
      animalCount: sheepCount,
      stableCount: 0,
    },
  ]
  p0.fenceSegments = ['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3'].map((edge) => ({
    edge,
    type: 'fence' as const,
    source: { kind: 'own' as const, ownerPlayerId: p0.id },
  }))
}

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession(
    withManualReactionOrder({
      seed: 1020,
      configure: (state) => {
        state.round = round
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
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

function finishFourWorkerRound(session: GameSession): SessionResponse {
  confirmTurns(session, session.takeAction(0, 'day-laborer'))
  confirmTurns(session, session.takeAction(1, 'forest'))
  confirmTurns(session, session.takeAction(0, 'clay-pit'))
  return session.takeAction(1, 'reed-bank')
}

function stepUntil(
  session: GameSession,
  initial: SessionResponse,
  stopWhen?: (resp: SessionResponse) => boolean,
): SessionResponse {
  let response = initial
  for (let step = 0; step < 32; step += 1) {
    expect(response.ok, response.error).toBe(true)
    if (stopWhen?.(response)) return response
    if (response.interaction.stateId !== 'wait') break
    const { playerIndex, request } = response.interaction
    if (request.kind === 'confirm-next-player' || request.kind === 'confirm-player-switch') {
      response = session.resolveChoice(
        request.kind === 'confirm-player-switch' ? request.fromPlayerIndex : playerIndex,
        'confirm',
      )
      continue
    }
    if (request.kind === 'feed') {
      response = session.resolveChoice(playerIndex, 'confirm', { selections: [] })
      continue
    }
    if (request.kind === 'animal-reorg') {
      response = session.resolveChoice(playerIndex, 'confirm', { zones: request.zones })
      continue
    }
    if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
      response = session.resolveChoice(playerIndex, '__skip__')
      continue
    }
    break
  }
  return response
}

describe('CWM102_Ram session', () => {
  it('pays 1 sheep on play, is not cookable as a physical sheep, scores as +1 sheep, breeds at Round 6 end, and feeds 1 food to stay and breed in Round 7 Harvest', () => {
    const session = setup(6, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [RAM]
      p0.improvements = ['Major_Fireplace1']
      takeMajorImprovementFromSupply(state, 'Major_Fireplace1')
      addSheepPasture(state, 2)
    })

    // Play Ram via Meeting Place: pays 1 sheep -> 1 physical sheep remains
    let r = confirmTurns(session, playMinor(session, RAM))
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.minorPlayed).toContain(RAM)
    expect(r.state.players[0]!.resources.sheep).toBe(1)

    // Seat 1 places 1st worker so it returns to Seat 0's idle work turn
    r = confirmTurns(session, session.takeAction(1, 'forest'))
    expect(r.state.currentPlayerIndex).toBe(0)

    // Verify if the sole physical sheep is cooked on Fireplace, sheep becomes 0, Ram CANNOT be cooked,
    // and scoring treats 0 physical sheep + Ram = 1 sheep (-1 -> +1 => +2 bonus VP, plus +1 printed VP)
    const openCook = session.takeAnytimeAction(0, 'exchange')
    expect(openCook.ok, openCook.error).toBe(true)
    const tradeOpt = sessionOptions(openCook).find(
      (option) => option.value.startsWith('trade:') && !option.disabled,
    )
    assert(tradeOpt)
    const cooked = session.resolveChoice(0, tradeOpt.value)
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources.sheep).toBe(0)
    // With 0 physical sheep, exchange is no longer available — Ram cannot be cooked!
    expect(
      cooked.interaction.anytimeActions.some((entry) => entry.id === 'exchange'),
    ).toBe(false)
    const zeroSheepBonus = cooked.scores[0]!.categories
      .find((category) => category.key === 'cardBonusVp')
      ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === RAM)
    expect(zeroSheepBonus?.score).toBe(2)

    // Undo the Fireplace cook and close the anytime exchange menu so 1 physical sheep remains
    r = session.undoStep()
    while (r.ok && r.interaction.stateId === 'wait') {
      r = session.undoStep()
    }
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.resources.sheep).toBe(1)

    // Finish Round 6 work phase and advance Round 6 end: Ram + 1 physical sheep = 2 parents -> breeds +1 sheep!
    confirmTurns(session, session.takeAction(0, 'day-laborer'))
    r = stepUntil(session, session.takeAction(1, 'clay-pit'))
    expect(r.state.round).toBe(7)
    expect(r.state.roundPhase).toBe('work')
    expect(r.state.players[0]!.resources.sheep).toBe(2)
    expect(r.state.log.length).toBeGreaterThan(0)

    // Finish Round 7 work phase (Seat 0 gains +2 food from day-laborer -> 14 food) -> enter Round 7 Harvest Feeding Phase
    r = stepUntil(
      session,
      finishFourWorkerRound(session),
      (resp) =>
        resp.interaction.stateId === 'wait' &&
        resp.interaction.request.kind === 'choice' &&
        sessionOptions(resp).some((option) => option.sourceCard === RAM),
    )
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    const payOption = sessionOptions(r).find(
      (option) => option.labelKey === 'actions.pay.name' && !option.disabled,
    )
    const discardOption = sessionOptions(r).find(
      (option) =>
        option.labelKey === 'actions.special-effect.return-card-to-board.name' && !option.disabled,
    )
    expect(payOption).toBeDefined()
    expect(discardOption).toBeDefined()

    // Feed 1 food to keep Ram -> family pays 4 food (14 - 1 - 4 = 9 food), 0 begging, then sheep breed to 3!
    r = stepUntil(session, session.resolveChoice(0, payOption!.value))
    expect(r.state.round).toBe(8)
    expect(r.state.players[0]!.minorPlayed).toContain(RAM)
    expect(r.state.players[0]!.resources.food).toBe(9)
    expect(r.state.players[0]!.resources.begging).toBe(0)
    expect(r.state.players[0]!.resources.sheep).toBe(3)
    // 3 physical sheep + 1 Ram = 4 sheep -> sheep tier rises from 1 VP (1-3) to 2 VP (4-5) => +1 bonus VP!
    const threeSheepBonus = r.scores[0]!.categories
      .find((category) => category.key === 'cardBonusVp')
      ?.entries.find((entry) => entry.type === 'bonus' && entry.cardId === RAM)
    expect(threeSheepBonus?.score).toBe(1)
  })

  it('allows discarding Ram in Harvest to save food for family (0 begging, stops breeding), auto-discards with 0 food and no conversions, and stays silent without a physical sheep or outside Rounds 6/8/10/12', () => {
    // 1. Voluntary discard when food reaches 4 at Harvest saves all 4 food for family (0 begging) and prevents breeding with 1 physical sheep
    const voluntaryDiscard = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [RAM]
      p0.resources.food = 2 // +2 from day-laborer -> 4 food at Harvest
      addSheepPasture(state, 1)
    })

    let r1 = stepUntil(
      voluntaryDiscard,
      finishFourWorkerRound(voluntaryDiscard),
      (resp) =>
        resp.interaction.stateId === 'wait' &&
        resp.interaction.request.kind === 'choice' &&
        sessionOptions(resp).some((option) => option.sourceCard === RAM),
    )
    const discardOpt = sessionOptions(r1).find(
      (option) => option.labelKey === 'actions.special-effect.return-card-to-board.name',
    )
    assert(discardOpt)
    r1 = stepUntil(voluntaryDiscard, voluntaryDiscard.resolveChoice(0, discardOpt.value))
    expect(r1.state.round).toBe(8)
    expect(r1.state.players[0]!.minorPlayed).not.toContain(RAM)
    expect(r1.state.players[0]!.resources.food).toBe(0)
    expect(r1.state.players[0]!.resources.begging).toBe(0)
    expect(r1.state.players[0]!.resources.sheep).toBe(1) // did not breed after Ram was discarded!

    // 2. Auto-discards without prompting when food = 0 and no anytime conversions exist (Minimal prompts; no extra begging from Ram)
    const autoDiscard = setup(7, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [RAM]
      p0.resources.food = 0
      addSheepPasture(state, 1) // no cooking improvement -> sheep cannot convert to food
    })
    confirmTurns(autoDiscard, autoDiscard.takeAction(0, 'clay-pit'))
    confirmTurns(autoDiscard, autoDiscard.takeAction(1, 'forest'))
    confirmTurns(autoDiscard, autoDiscard.takeAction(0, 'reed-bank'))
    const r2 = stepUntil(autoDiscard, autoDiscard.takeAction(1, 'day-laborer'))
    expect(r2.state.round).toBe(8)
    expect(r2.state.players[0]!.minorPlayed).not.toContain(RAM)
    expect(r2.state.players[0]!.resources.begging).toBe(4) // 4 from 2 unfed family members, 0 from Ram!
    expect(r2.state.players[0]!.resources.sheep).toBe(1)

    // 3. Stays silent at Round 5 end (not 6/8/10/12) even with 1 physical sheep, and at Round 6 end with 0 physical sheep
    const roundFive = setup(5, (state) => {
      state.players[0]!.minorPlayed = [RAM]
      addSheepPasture(state, 1)
    })
    const r3 = stepUntil(roundFive, finishFourWorkerRound(roundFive))
    expect(r3.state.round).toBe(6)
    expect(r3.state.players[0]!.resources.sheep).toBe(1)

    const zeroPhysicalSheep = setup(6, (state) => {
      state.players[0]!.minorPlayed = [RAM]
      addSheepPasture(state, 0)
    })
    const r4 = stepUntil(zeroPhysicalSheep, finishFourWorkerRound(zeroPhysicalSheep))
    expect(r4.state.round).toBe(7)
    expect(r4.state.players[0]!.resources.sheep).toBe(0)
  })
})
