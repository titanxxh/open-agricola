import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { CWM018_ExpertBuilder } from '../../shared/cards/classic/CWM/CWM018_ExpertBuilder'
import type { GameState } from '../../shared/contract/types'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession } from '../game/authoritative-session'
import { sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'

const EXPERT = 'CWM018_ExpertBuilder'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 1801,
    configure: (state) => {
      state.round = round
      for (const player of state.players) {
        player.resources.food = 5
        setWorkersAtHome(state, player, 2)
      }
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

describe('CWM018_ExpertBuilder session', () => {
  it('declares 3+ player count, forces an opponent room builder to place 1 paid resource on the card, spends it on owner room extension, and supports undoAction', () => {
    expect(CWM018_ExpertBuilder.meta.players).toBe('3+')

    const session = setup(1, (state) => {
      state.currentPlayerIndex = 1
      const p0 = state.players[0]!
      const p1 = state.players[1]!
      p0.occupationPlayed = [EXPERT]
      Object.assign(p0.resources, { wood: 5, reed: 1 })
      Object.assign(p1.resources, { wood: 5, reed: 2 })
    })

    // Opponent (player 1) builds a wood room at (0, 0) paying 5 wood + 2 reed:
    const resp = session.takeAction(1, 'farm-expansion')
    const constructBranch = sessionOptions(resp).find((o) => o.value.includes('construct'))
    if (constructBranch) {
      session.resolveChoice(1, constructBranch.value)
    }
    const afterRoom = session.commitSelectionChoice(1, { rooms: [{ row: 0, col: 0 }] })
    expect(afterRoom.ok, afterRoom.error).toBe(true)
    assert(afterRoom.interaction.stateId === 'wait')
    // Opponent (seat 1) must choose between wood and reed (clay/stone were NOT paid):
    expect(afterRoom.interaction.playerIndex).toBe(1)
    expect(afterRoom.interaction.sourceCard).toBe(EXPERT)
    const paidOptions = sessionOptions(afterRoom)
    expect(paidOptions.map((o) => o.labelKey).sort()).toEqual(['resources.reed', 'resources.wood'])

    const reedChoice = paidOptions.find((o) => o.labelKey === 'resources.reed')!
    const stored = session.resolveChoice(1, reedChoice.value)
    expect(stored.ok, stored.error).toBe(true)
    expect(stored.state.players[1]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(stored.state.players[0]!.cardStates[EXPERT]?.counters?.reed).toBe(1)
    expect(stored.state.log.length).toBeGreaterThan(0)
    expect(
      stored.state.events.some(
        (e) =>
          e.type === 'resource.moved'
          && e.sourceCardId === EXPERT
          && e.to.kind === 'card'
          && e.to.cardId === EXPERT
          && e.resources.reed === 1,
      ),
    ).toBe(true)

    // Free farm-expansion for the next turn so player 0 (with 5 wood + 1 reed, short 1 reed) can build using Expert Builder's reed:
    stored.state.actionSpaces.find((s) => s.id === 'farm-expansion')!.takenBy = []
    confirmTurns(session, stored)

    const ownerExpand = session.takeAction(0, 'farm-expansion')
    const ownerConstruct = sessionOptions(ownerExpand).find((o) => o.value.includes('construct'))
    if (ownerConstruct) {
      session.resolveChoice(0, ownerConstruct.value)
    }
    const afterOwnerRoom = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(afterOwnerRoom.ok, afterOwnerRoom.error).toBe(true)

    // Undo before completing restores the stored reed on Expert Builder and player 0's resources/rooms:
    const undone = session.undoAction(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.rooms).toBe(2)
    expect(undone.state.players[0]!.resources).toMatchObject({ wood: 5, reed: 1 })
    expect(undone.state.players[0]!.cardStates[EXPERT]?.counters?.reed).toBe(1)

    // Re-execute owner room extension and also satisfy Expert Builder's own room-built trigger:
    const redo = session.takeAction(0, 'farm-expansion')
    const redoConstruct = sessionOptions(redo).find((o) => o.value.includes('construct'))
    if (redoConstruct) {
      session.resolveChoice(0, redoConstruct.value)
    }
    let built = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    // If a payment choice appears, choose the option using Expert Builder's reed (paying 5 wood + 1 reed from supply):
    const discountOpt = sessionOptions(built).find(
      (o) =>
        o.effectPreview?.kind === 'payment'
        && o.effectPreview.resourcesPaid.wood === 5
        && (o.effectPreview.resourcesPaid.reed ?? 0) === 1,
    )
    if (discountOpt) {
      built = session.resolveChoice(0, discountOpt.value)
    }
    // Owner actually paid 5 wood + 1 reed from supply -> owner places 1 paid resource (wood) back onto Expert Builder!
    const woodOpt = sessionOptions(built).find((o) => o.labelKey === 'resources.wood')!
    expect(woodOpt).toBeDefined()
    const finalResp = session.resolveChoice(0, woodOpt.value)
    expect(finalResp.ok, finalResp.error).toBe(true)
    expect(finalResp.state.players[0]!.rooms).toBe(3)
    expect(finalResp.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(finalResp.state.players[0]!.cardStates[EXPERT]?.counters).toMatchObject({
      reed: 0,
      wood: 1,
    })
  })

  it('offers full-price alongside stored-resource discounts on renovation, and stays silent on stables-only or non-extension/renovation costs', () => {
    // Subcase A: Renovation with both stored clay & reed on Expert Builder + enough personal clay & reed
    const session = setup(6, (state) => {
      const redevIdx = state.roundActionOrder.indexOf('house-redevelopment')
      assert(redevIdx >= 0)
      state.roundActionOrder[redevIdx] = state.roundActionOrder[0]!
      state.roundActionOrder[0] = 'house-redevelopment'
      const p0 = state.players[0]!
      p0.occupationPlayed = [EXPERT]
      p0.cardStates[EXPERT] = { counters: { clay: 1, reed: 1 } }
      Object.assign(p0.resources, { clay: 2, reed: 1 })
    })

    let reno = session.takeAction(0, 'house-redevelopment')
    const renoBranch = sessionOptions(reno).find((o) => o.value.includes('renovate'))
    if (renoBranch) {
      reno = session.resolveChoice(0, renoBranch.value)
    }
    const paymentChoices = sessionOptions(reno).filter((o) => o.effectPreview?.kind === 'payment')
    // Must include both full-price (2 clay + 1 reed) and spending both stored clay + reed (1 clay + 0 reed):
    const fullPrice = paymentChoices.find(
      (o) =>
        o.effectPreview?.kind === 'payment'
        && o.effectPreview.resourcesPaid.clay === 2
        && o.effectPreview.resourcesPaid.reed === 1,
    )
    const spendBoth = paymentChoices.find(
      (o) =>
        o.effectPreview?.kind === 'payment'
        && o.effectPreview.resourcesPaid.clay === 1
        && (o.effectPreview.resourcesPaid.reed ?? 0) === 0,
    )
    expect(fullPrice).toBeDefined()
    expect(spendBoth).toBeDefined()

    const renovated = session.resolveChoice(0, spendBoth!.value)
    expect(renovated.ok, renovated.error).toBe(true)
    expect(renovated.state.players[0]!.houseType).toBe('clay')
    expect(renovated.state.players[0]!.resources).toMatchObject({ clay: 1, reed: 1 })
    expect(renovated.state.players[0]!.cardStates[EXPERT]?.counters).toMatchObject({
      clay: 0,
      reed: 0,
    })

    // Subcase B: Building only a stable on Farm Expansion does NOT trigger Expert Builder store,
    // and stored wood on Expert Builder cannot pay for fencing or stables!
    const negSession = setup(2, (state) => {
      const fenceIdx = state.roundActionOrder.indexOf('fencing')
      assert(fenceIdx >= 0)
      state.roundActionOrder[fenceIdx] = state.roundActionOrder[0]!
      state.roundActionOrder[0] = 'fencing'
      const p0 = state.players[0]!
      p0.occupationPlayed = [EXPERT]
      p0.cardStates[EXPERT] = { counters: { wood: 2 } }
      p0.resources.wood = 2
    })

    // 4 fence edges require 4 wood -> player only has 2 personal wood, and Expert Builder's 2 wood cannot pay for fences!
    negSession.takeAction(0, 'fencing')
    const fenceFail = negSession.commitSelectionChoice(0, {
      edges: ['H-0-2', 'H-1-2', 'V-0-2', 'V-0-3'],
    })
    expect(fenceFail.ok).toBe(false)
    negSession.undoAction(0)

    // Building a single stable on Farm Expansion (costs 2 personal wood, 0 rooms built) does NOT add wood to Expert Builder:
    const expand = negSession.takeAction(0, 'farm-expansion')
    if (expand.interaction.stateId === 'wait' && expand.interaction.request.kind === 'choice') {
      const stableBranch = sessionOptions(expand).find((o) => o.value.includes('stables'))!
      negSession.resolveChoice(0, stableBranch.value)
    }
    const stableBuilt = negSession.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] })
    expect(stableBuilt.ok, stableBuilt.error).toBe(true)
    expect(stableBuilt.interaction.request.kind).toBe('confirm-next-player')
    expect(stableBuilt.state.players[0]!.cardStates[EXPERT]?.counters?.wood).toBe(2)
  })

  it('requires placing 1 paid resource back on Expert Builder even when a room extension is funded 100% from stored resources', () => {
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.occupationPlayed = [EXPERT]
      p0.cardStates[EXPERT] = { counters: { wood: 5, reed: 2 } }
      Object.assign(p0.resources, { wood: 0, reed: 0, clay: 0, stone: 0 })
    })

    const expand = session.takeAction(0, 'farm-expansion')
    const constructBranch = sessionOptions(expand).find((o) => o.value.includes('construct'))
    if (constructBranch) {
      session.resolveChoice(0, constructBranch.value)
    }
    let afterRoom = session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }] })
    expect(afterRoom.ok, afterRoom.error).toBe(true)
    const payOpt = sessionOptions(afterRoom).find((o) => o.effectPreview?.kind === 'payment')
    if (payOpt) {
      afterRoom = session.resolveChoice(0, payOpt.value)
    }

    assert(afterRoom.interaction.stateId === 'wait')
    expect(afterRoom.interaction.playerIndex).toBe(0)
    expect(afterRoom.interaction.sourceCard).toBe(EXPERT)
    const storeChoices = sessionOptions(afterRoom)
    expect(storeChoices.map((o) => o.labelKey).sort()).toEqual(['resources.reed', 'resources.wood'])

    const putBackReed = storeChoices.find((o) => o.labelKey === 'resources.reed')!
    const completed = session.resolveChoice(0, putBackReed.value)
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.players[0]!.rooms).toBe(3)
    expect(completed.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0 })
    expect(completed.state.players[0]!.cardStates[EXPERT]?.counters).toMatchObject({
      wood: 0,
      reed: 1,
    })
  })
})
