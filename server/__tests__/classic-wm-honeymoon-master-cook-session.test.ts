import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { hasLegalPlaceFarmerTargets } from '../../shared/actions/effects/place-farmer'
import { CWM036_MasterCook } from '../../shared/cards/classic/CWM/CWM036_MasterCook'
import { CWM090_Honeymoon } from '../../shared/cards/classic/CWM/CWM090_Honeymoon'
import { getWorkersHeldOnCard } from '../../shared/cards/helpers/card-held-workers'
import { pushToCardStack } from '../../shared/cards/helpers/card-state'
import type { GameState } from '../../shared/contract/types'
import {
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAvailable,
} from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { chooseSupplyWorkerTurn } from './_helpers/supply-worker-turn'
import { createWorkSession } from './_helpers/session-fixtures'
import { withManualReactionOrder } from './_helpers/trigger-select'

const HONEYMOON = CWM090_Honeymoon.meta.id
const MASTER_COOK = CWM036_MasterCook.meta.id
const MASTER_COOK_ANYTIME_ID = `${MASTER_COOK}-first`

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setupTwoPlayer(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession(
    withManualReactionOrder({
      seed: 3690,
      configure: (state) => {
        state.round = round
        for (const player of state.players) {
          player.minorHand = ['__test_placeholder__']
          player.occupationHand = ['__test_placeholder__']
          player.resources.food = 20
          setWorkersAtHome(state, player, 2)
        }
        configure(state)
      },
    }),
  )
  sessions.push(session)
  return session
}

function setupThreePlayer(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession(
    withManualReactionOrder({
      seed: 3691,
      options: { playerCount: 3 },
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

function settleRoundAdvance(session: GameSession, initial: SessionResponse): SessionResponse {
  let response = initial
  for (let step = 0; step < 32; step += 1) {
    expect(response.ok, response.error).toBe(true)
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

describe('CWM090_Honeymoon & CWM036_MasterCook session', () => {
  it('CWM090_Honeymoon charges 2 food for 5 VP in Round 13, holds 2 family members in Round 14 work phase, and releases them for Return Home and Harvest', () => {
    const session = setupTwoPlayer(13, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [HONEYMOON]
      p0.rooms = 3
      p0.roomTiles = [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
        { row: 2, col: 0 },
      ]
      setActiveWorkerCount(p0, 3)
      setWorkersAtHome(state, p0, 3)
    })

    let r = playMinor(session, HONEYMOON)
    expect(r.ok, r.error).toBe(true)
    expect(r.state.players[0]!.minorPlayed).toContain(HONEYMOON)
    expect(r.state.players[0]!.resources.food).toBe(18)
    const cardEntry = r.scores[0]!.categories
      .find((category) => category.key === 'cards')
      ?.entries.find((entry) => entry.type === 'card' && entry.cardId === HONEYMOON)
    expect(cardEntry?.score).toBe(5)
    // In Round 13, Seat 0 still has 2 remaining workers at home (3 total - 1 placed on Meeting Place)
    expect(workersAvailable(r.state, r.state.players[0]!)).toBe(2)

    confirmTurns(session, r)
    confirmTurns(session, session.takeAction(1, 'forest'))
    r = confirmTurns(session, session.takeAction(0, 'day-laborer'))
    expect(r.state.players[0]!.resources.food).toBe(20) // 18 + 2 from day-laborer
    confirmTurns(session, session.takeAction(1, 'clay-pit'))

    // Placing the final worker of Round 13 + settling confirmations runs Round 13 Harvest (-6 food -> 14 food) and enters Round 14!
    r = settleRoundAdvance(session, session.takeAction(0, 'reed-bank'))
    expect(r.state.round).toBe(14)
    expect(r.state.roundPhase).toBe('work')
    expect(r.state.players[0]!.resources.food).toBe(14)

    // In Round 14, Honeymoon holds 2 of Seat 0's 3 family members -> only 1 worker available!
    expect(getWorkersHeldOnCard(r.state.players[0]!, HONEYMOON)).toHaveLength(2)
    expect(workersAvailable(r.state, r.state.players[0]!)).toBe(1)
    expect(r.state.currentPlayerIndex).toBe(0)

    // Seat 0 places their sole available worker; Seat 1 then places both workers to finish Round 14
    r = confirmTurns(session, session.takeAction(0, 'day-laborer'))
    expect(workersAvailable(r.state, r.state.players[0]!)).toBe(0)
    expect(r.state.currentPlayerIndex).toBe(1)

    r = confirmTurns(session, session.takeAction(1, 'forest'))
    expect(r.state.currentPlayerIndex).toBe(1)

    // Return Home releases held workers and Round 14 Harvest feeds all 3 family members (16 - 6 = 10 food)
    r = settleRoundAdvance(session, session.takeAction(1, 'clay-pit'))
    expect(getWorkersHeldOnCard(r.state.players[0]!, HONEYMOON)).toEqual([])
    expect(r.state.players[0]!.resources.food).toBe(10)
    expect(r.state.gameOver).toBe(true)
  })

  it('CWM090_Honeymoon with a 2-person Start Player holds both workers in Round 14 and rotates immediately to Seat 1', () => {
    const session = setupTwoPlayer(13, (state) => {
      state.players[0]!.minorPlayed = [HONEYMOON]
      state.players[0]!.startPlayer = true
      state.players[1]!.startPlayer = false
    })

    // Place all 4 workers in Round 13 -> automatically transitions into Round 14 work phase
    confirmTurns(session, session.takeAction(0, 'day-laborer'))
    confirmTurns(session, session.takeAction(1, 'forest'))
    confirmTurns(session, session.takeAction(0, 'clay-pit'))
    let r = settleRoundAdvance(session, session.takeAction(1, 'reed-bank'))

    expect(r.state.round).toBe(14)
    expect(r.state.roundPhase).toBe('work')
    expect(workersAvailable(r.state, r.state.players[0]!)).toBe(0)
    expect(r.state.currentPlayerIndex).toBe(1)

    confirmTurns(session, session.takeAction(1, 'day-laborer'))
    r = settleRoundAdvance(session, session.takeAction(1, 'forest'))
    expect(r.state.gameOver).toBe(true)
  })

  it('CWM090_Honeymoon cannot be played in Round 14 (maxRound 13)', () => {
    const session = setupTwoPlayer(14, (state) => {
      state.players[0]!.minorHand = [HONEYMOON, 'A054_Credit']
    })

    let r = session.takeAction(0, 'meeting-place')
    if (
      r.interaction.stateId === 'wait' &&
      sessionOptions(r).some((option) => option.value.startsWith('action-improvement-'))
    ) {
      const impBranch = sessionOptions(r).find((option) =>
        option.value.startsWith('action-improvement-'),
      )!
      r = session.resolveChoice(0, impBranch.value)
    }
    expect(r.ok, r.error).toBe(true)
    expect(
      sessionOptions(r).some((option) => option.value === HONEYMOON && !option.disabled),
    ).toBe(false)
    const rejected = session.resolveChoice(0, HONEYMOON)
    expect(rejected.ok).toBe(false)
  })

  it('CWM036_MasterCook has 3+ player count, replaces 1st family member turn for 2 food + 1 Guest, supports undoAction, and dispatches Guest after another player places', () => {
    expect(CWM036_MasterCook.meta.players).toBe('3+')

    const session = setupThreePlayer(1, (state) => {
      state.players[0]!.occupationPlayed = [MASTER_COOK]
      state.players[0]!.resources.food = 0
    })

    const initial = session.getState()
    expect(
      initial.interaction.anytimeActions.some((entry) => entry.id === MASTER_COOK_ANYTIME_ID),
    ).toBe(true)

    // Trigger Master Cook, then test undoAction before confirming next player
    const preview = session.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID)
    expect(preview.ok, preview.error).toBe(true)
    expect(preview.state.players[0]!.resources.food).toBe(2)
    expect(preview.state.players[0]!.guests).toHaveLength(1)
    expect(workersAvailable(preview.state, preview.state.players[0]!)).toBe(1)

    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources.food).toBe(0)
    expect(undone.state.players[0]!.guests ?? []).toHaveLength(0)
    expect(workersAvailable(undone.state, undone.state.players[0]!)).toBe(2)
    expect(undone.state.currentPlayerIndex).toBe(0)

    // Re-invoke Master Cook and confirm turn handoff to Seat 1
    let r = confirmTurns(session, session.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID))
    expect(r.state.players[0]!.resources.food).toBe(2)
    expect(r.state.players[0]!.guests).toHaveLength(1)
    expect(
      r.state.actionSpaces.find((space) => space.id === `card-worker:${MASTER_COOK}`)?.takenBy,
    ).toHaveLength(1)
    expect(r.state.log.length).toBeGreaterThan(0)
    expect(r.state.currentPlayerIndex).toBe(1)

    // Seats 1 and 2 place their first workers in between
    confirmTurns(session, session.takeAction(1, 'day-laborer'))
    r = confirmTurns(session, session.takeAction(2, 'clay-pit'))
    expect(r.state.currentPlayerIndex).toBe(0)

    // Seat 0 is offered the Guest turn (before remaining family member) -> activate Guest and dispatch to forest
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
    const activateGuest = sessionOptions(r).find(
      (option) => option.labelKey === 'actions.activate-extra-turn.name',
    )
    if (activateGuest) {
      r = session.resolveChoice(0, activateGuest.value)
    }
    const forestOpt = sessionOptions(r).find((option) => option.value === 'forest')
    expect(forestOpt).toBeDefined()
    r = confirmTurns(session, session.resolveChoice(0, 'forest'))
    expect(r.state.players[0]!.resources.wood).toBe(3)
    expect(workersAvailable(r.state, r.state.players[0]!)).toBe(1)

    // Seats 1 and 2 place their second workers; Seat 0 then places their remaining 2nd family member
    confirmTurns(session, session.takeAction(1, 'reed-bank'))
    r = confirmTurns(session, session.takeAction(2, 'grain-seeds'))
    expect(r.state.currentPlayerIndex).toBe(0)

    const beforeConfirmLast = session.takeAction(0, 'fishing')
    expect(beforeConfirmLast.ok, beforeConfirmLast.error).toBe(true)
    expect(workersAvailable(beforeConfirmLast.state, beforeConfirmLast.state.players[0]!)).toBe(0)

    // Confirming the final placement runs Return Home, cleaning up the Guest and bringing family members home
    r = settleRoundAdvance(session, beforeConfirmLast)
    expect(r.state.round).toBe(2)
    expect(r.state.players[0]!.guests ?? []).toHaveLength(0)
    expect(workersAvailable(r.state, r.state.players[0]!)).toBe(2)
  })

  it('CWM036_MasterCook stays unavailable after 1st family placement, when no other player can place in between, on Snake Opening turnaround seat, mid-action, and blocks consecutive card placement before an opponent places', () => {
    // 1. Unavailable on Seat 0's 2nd turn after placing 1st family member normally
    const afterFirst = setupThreePlayer(1, (state) => {
      state.players[0]!.occupationPlayed = [MASTER_COOK]
    })
    confirmTurns(afterFirst, afterFirst.takeAction(0, 'day-laborer'))
    confirmTurns(afterFirst, afterFirst.takeAction(1, 'forest'))
    const r1 = confirmTurns(afterFirst, afterFirst.takeAction(2, 'clay-pit'))
    expect(r1.state.currentPlayerIndex).toBe(0)
    expect(
      r1.interaction.anytimeActions.some((entry) => entry.id === MASTER_COOK_ANYTIME_ID),
    ).toBe(false)
    expect(afterFirst.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID).ok).toBe(false)

    // 2. Unavailable when all other players have 0 people left to place
    const noOthersLeft = setupThreePlayer(1, (state) => {
      state.players[0]!.occupationPlayed = [MASTER_COOK]
      markAllWorkersUsed(state, state.players[1]!)
      markAllWorkersUsed(state, state.players[2]!)
    })
    expect(
      noOthersLeft
        .getState()
        .interaction.anytimeActions.some((entry) => entry.id === MASTER_COOK_ANYTIME_ID),
    ).toBe(false)
    expect(noOthersLeft.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID).ok).toBe(false)

    // 3. Unavailable on Snake Opening forward-pass turnaround seat (acts twice consecutively without another player in between)
    const snakeTurnaround = setupThreePlayer(1, (state) => {
      state.enableSnakeOpening = true
      state.snakeOpening = { reversed: false }
      state.roundFirstPlayerId = state.players[0]!.id
      state.currentPlayerIndex = 2
      state.players[2]!.occupationPlayed = [MASTER_COOK]
    })
    expect(
      snakeTurnaround
        .getState()
        .interaction.anytimeActions.some((entry) => entry.id === MASTER_COOK_ANYTIME_ID),
    ).toBe(false)
    expect(snakeTurnaround.takeAnytimeAction(2, MASTER_COOK_ANYTIME_ID).ok).toBe(false)

    // 4. Blocks consecutive card-triggered place-farmer before another player places, and blocks mid-action invocation
    const blockConsecutive = setupThreePlayer(1, (state) => {
      const grainUtilIdx = state.roundActionOrder.indexOf('grain-utilization')
      if (grainUtilIdx >= 0) {
        state.roundActionOrder[grainUtilIdx] = state.roundActionOrder[0]!
        state.roundActionOrder[0] = 'grain-utilization'
      }
      state.players[0]!.occupationPlayed = [MASTER_COOK]
      state.players[0]!.resources.grain = 1
      state.players[0]!.fields = [{ row: 0, col: 2, stacks: [] }]
    })

    // Mid-action check: start grain-utilization so engine is waiting, verify Master Cook replacesTurn is rejected
    const midAction = blockConsecutive.takeAction(0, 'grain-utilization')
    expect(midAction.interaction.stateId).toBe('wait')
    expect(blockConsecutive.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID).ok).toBe(false)
    expect(blockConsecutive.undoAction().ok).toBe(true)

    // Invoke Master Cook -> before Seat 1 places, non-guest place-farmer has 0 legal targets; once Seat 1 places, it unblocks
    const afterMasterCook = blockConsecutive.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID)
    expect(afterMasterCook.ok, afterMasterCook.error).toBe(true)
    const blockedBeforeOpponent = blockConsecutive.withCtx(() =>
      hasLegalPlaceFarmerTargets(
        blockConsecutive.state,
        blockConsecutive.state.players[0]!,
        blockConsecutive.actionHooks,
        'C125_Nightworker',
        undefined,
      ),
    )
    expect(blockedBeforeOpponent).toBe(false)

    confirmTurns(blockConsecutive, afterMasterCook)
    confirmTurns(blockConsecutive, blockConsecutive.takeAction(1, 'day-laborer'))
    const unblockedAfterOpponent = blockConsecutive.withCtx(() =>
      hasLegalPlaceFarmerTargets(
        blockConsecutive.state,
        blockConsecutive.state.players[0]!,
        blockConsecutive.actionHooks,
        'C125_Nightworker',
        undefined,
      ),
    )
    expect(unblockedAfterOpponent).toBe(true)

    // 5. In Farmers of the Moor with worker '1' sick and worker '2' healthy, Master Cook spends healthy worker '2'
    const moorSession = createWorkSession(
      withManualReactionOrder({
        seed: 3695,
        options: { playerCount: 3, enableFarmersOfTheMoor: true },
        configure: (state) => {
          state.round = 1
          for (const player of state.players) {
            player.minorHand = ['__test_placeholder__']
            player.occupationHand = ['__test_placeholder__']
            player.resources.food = 10
            setWorkersAtHome(state, player, 2)
          }
          state.players[0]!.occupationPlayed = [MASTER_COOK]
          state.players[0]!.sickWorkerIds = ['1']
        },
      }),
    )
    sessions.push(moorSession)

    let moorResp = confirmTurns(moorSession, moorSession.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID))
    expect(
      moorResp.state.actionSpaces.find((space) => space.id === `card-worker:${MASTER_COOK}`)
        ?.takenBy,
    ).toEqual([{ playerId: moorResp.state.players[0]!.id, workerId: '2' }])
    // Seats 1 and 2 place; when rotation returns to Seat 0, activate the Guest turn and dispatch to day-laborer
    confirmTurns(moorSession, moorSession.takeAction(1, 'forest'))
    moorResp = confirmTurns(moorSession, moorSession.takeAction(2, 'clay-pit'))
    expect(moorResp.state.currentPlayerIndex).toBe(0)
    const activateMoorGuest = sessionOptions(moorResp).find(
      (option) => option.labelKey === 'actions.activate-extra-turn.name',
    )
    if (activateMoorGuest) {
      moorResp = moorSession.resolveChoice(0, activateMoorGuest.value)
    }
    const guestOnDayLaborer = sessionOptions(moorResp).find(
      (option) => option.value === 'day-laborer',
    )
    expect(guestOnDayLaborer).toBeDefined()
    confirmTurns(moorSession, moorSession.resolveChoice(0, 'day-laborer'))
    confirmTurns(moorSession, moorSession.takeAction(1, 'reed-bank'))
    confirmTurns(moorSession, moorSession.takeAction(2, 'grain-seeds'))
    // Sick worker '1' cannot take fishing -> takeAction on Seat 0 is rejected
    expect(moorSession.takeAction(0, 'fishing').ok).toBe(false)
  })
})

describe('CWM036_MasterCook placement counting', () => {
  it('counts an opponent pending Adoptive Parents newborn turn as a placement in between', () => {
    const session = setupThreePlayer(1, (state) => {
      state.players[0]!.occupationPlayed = [MASTER_COOK]
      state.players[0]!.resources.food = 0
      // Seat 1: ordinary workers all out, one newborn activatable via A092_AdoptiveParents.
      const p1 = state.players[1]!
      setActiveWorkerCount(p1, 1)
      setWorkersAtHome(state, p1, 0)
      p1.workers.find((worker) => worker.isActive)!.isNewborn = true
      p1.occupationPlayed = ['A092_AdoptiveParents']
      p1.resources.food = 3
      // Seat 2: ordinary workers all out, no extra turn.
      setWorkersAtHome(state, state.players[2]!, 0)
      state.currentPlayerIndex = 0
    })

    const initial = session.getState()
    expect(workersAvailable(initial.state, initial.state.players[1]!)).toBe(0)
    expect(initial.interaction.anytimeActions.some((entry) => entry.id === MASTER_COOK_ANYTIME_ID)).toBe(true)

    const cooked = confirmTurns(session, session.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID))
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources.food).toBe(2)
    expect(cooked.state.players[0]!.guests).toHaveLength(1)
    expect(cooked.state.actionSpaces.find((space) => space.id === `card-worker:${MASTER_COOK}`)?.takenBy)
      .toEqual([{ playerId: cooked.state.players[0]!.id, workerId: '1' }])
  })

  it('does not treat an earlier Guest Room supply person as the first family member', () => {
    const session = setupThreePlayer(1, (state) => {
      state.players[0]!.occupationPlayed = [MASTER_COOK]
      state.currentPlayerIndex = 0
    })
    // Guest Room offers its supply turn on load, so add it after the idle fixture check.
    const state = session.getState().state
    const p0 = state.players[0]!
    p0.minorPlayed = ['E022_GuestRoom']
    pushToCardStack(p0, 'E022_GuestRoom', ['food'])
    session.loadState(state)

    chooseSupplyWorkerTurn(session, 'E022_GuestRoom')
    const supplyPlaced = confirmTurns(session, session.resolveChoice(0, 'day-laborer'))
    expect(supplyPlaced.ok, supplyPlaced.error).toBe(true)
    const supplyWorkerId = supplyPlaced.state.actionSpaces.find((space) => space.id === 'day-laborer')!.takenBy[0]!.workerId
    expect(supplyPlaced.state.players[0]!.workers.find((worker) => worker.id === supplyWorkerId)?.supplyUse).toBeDefined()
    expect(workersAvailable(supplyPlaced.state, supplyPlaced.state.players[0]!)).toBe(2)

    confirmTurns(session, session.takeAction(1, 'forest'))
    const back = confirmTurns(session, session.takeAction(2, 'clay-pit'))
    expect(back.state.currentPlayerIndex).toBe(0)
    expect(back.interaction.anytimeActions.some((entry) => entry.id === MASTER_COOK_ANYTIME_ID)).toBe(true)

    const food = back.state.players[0]!.resources.food
    const cooked = confirmTurns(session, session.takeAnytimeAction(0, MASTER_COOK_ANYTIME_ID))
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources.food).toBe(food + 2)
    expect(cooked.state.players[0]!.guests).toHaveLength(1)
    expect(workersAvailable(cooked.state, cooked.state.players[0]!)).toBe(1)
  })
})
