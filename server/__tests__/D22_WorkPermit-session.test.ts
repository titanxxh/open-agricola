import { createWorkSession } from './_helpers/session-fixtures'
import { collectScheduledEffectPreviews } from '../../shared/actions/scheduled-effect-preview'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { describe, expect, it, afterEach } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import {
  inactiveWorkersInSupply,
  markAllWorkersUsed,
  setActiveWorkerCount,
  setWorkersAtHome,
  workersAtHome,
  familySize,
  workersAvailable,
} from '../../shared/domain/player'

import '../../shared/cards/D/D022_WorkPermit'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit32Supply from './_helpers/audit/ae-negative-32-supply'

const CARD_ID = 'D022_WorkPermit'
const FILLER = '__test_placeholder__'

const setupPurchase = ({
  round = 5, food = 1, wood = 1, clay = 0, reed = 0, stone = 0, supplyFarmer = true,
} = {}) => {
  const session = createWorkSession({ seed: 6022, options: { playerCount: 2 } })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player, index) => {
    setActiveWorkerCount(player, index === 0 && !supplyFarmer ? 5 : 2)
    setWorkersAtHome(state, player, index === 0 ? player.workers.filter((worker) => worker.isActive).length : 0)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    player.resources = {
      ...player.resources,
      wood: index === 0 ? wood : 0,
      clay: index === 0 ? clay : 0,
      reed: index === 0 ? reed : 0,
      stone: index === 0 ? stone : 0,
      food: index === 0 ? food : 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  state.players[0]!.minorHand = [CARD_ID, FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterMinor = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (response.interaction.stateId !== 'wait') return response
  if (!response.interaction.request.options?.some((option) => option.value === CARD_ID)) {
    const branch = response.interaction.request.options?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (branch) response = session.resolveChoice(response.interaction.playerIndex, branch.value)
  }
  return response
}

const play = (session: GameSession): SessionResponse => {
  let response = enterMinor(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  if (card) response = session.resolveChoice(response.interaction.playerIndex, card.value)
  return response
}

const offered = (response: SessionResponse) => response.interaction.stateId === 'wait'
  && (response.interaction.request.options?.some((option) => option.value === CARD_ID) ?? false)

const workPermitRounds = (session: GameSession, response: SessionResponse) => [...new Set(session.withCtx(() => collectScheduledEffectPreviews(response.state, response.state.players[0]!, session.actionHooks))
  .filter(entry => entry.sourceCard === CARD_ID).map(entry => entry.round))].sort((left, right) => left - right)

const setupDue = (buildingResources: { wood?: number; clay?: number; reed?: number; stone?: number } = { wood: 1 }) => {
  const session = setupPurchase({ food: 21, wood: 0, ...buildingResources })
  const purchase = play(session)
  expect(purchase.ok, purchase.error).toBe(true)
  const state = session.getState().state
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    markAllWorkersUsed(state, player)
  })
  session.loadState(state)
  return session
}

const acceptWorkPermit = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return chooseSupplyWorkerTurn(session, CARD_ID)
}

describe('D022 Work Permit parity', () => {
  it('D022 S1: one building resource reserves a supply person for the next round and costs one food', () => {
    const session = setupPurchase()
    const supplyBefore = inactiveWorkersInSupply(session.state.players[0]!).length

    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, wood: 1 })
    expect(workPermitRounds(session, response)).toEqual([6])
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(supplyBefore - 1)
  })

  it('D022 S2: every building resource unit contributes one round without being consumed', () => {
    const session = setupPurchase({ wood: 1, clay: 2, reed: 1 })
    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(workPermitRounds(session, response)).toEqual([9])
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 1, clay: 2, reed: 1, stone: 0, food: 0,
    })
  })

  it('D022 S3: without a building resource Work Permit is unavailable and pays nothing', () => {
    const session = setupPurchase({ wood: 0 })
    const response = enterMinor(session)

    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(workPermitRounds(session, response)).toEqual([])
  })

  it('D022 S4: Work Permit is unavailable without a supply person and pays nothing', () => {
    const session = setupPurchase({ supplyFarmer: false })
    const response = enterMinor(session)
    expect(offered(response)).toBe(false)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(workPermitRounds(session, response)).toEqual([])
  })

  it('D022 S5: a target after round fourteen still plays and pays but schedules no person', () => {
    const session = setupPurchase({ round: 13, wood: 1, clay: 1 })
    const response = play(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(workPermitRounds(session, response)).toEqual([])
  })

  it('D022 S6: uses a supply person for the target-round placement and keeps regular people at home', () => {
    const session = setupDue()
    let response = acceptWorkPermit(session, session.performRoundEnd())
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(response.interaction.request.options?.map((option) => option.value)).toContain('forest')
    response = session.resolveChoice(response.interaction.playerIndex, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(2)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: response.state.players[0]!.id, workerId: '3' }))
  })

  it('D022 S7: the target-round opportunity can be declined after normal placements finish', () => {
    const session = setupDue()
    expect(session.performRoundEnd().ok).toBe(true)
    for (const spaceId of ['forest', 'day-laborer', 'clay-pit', 'reed-bank']) {
      const response = takeNormalWorkerTurn(session, spaceId)
      expect(response.ok, response.error).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const offered = session.getState()
    expect(offered.interaction.stateId).toBe('wait')
    if (offered.interaction.stateId !== 'wait') return
    const decline = offered.interaction.request.options?.find((option) => option.labelKey === 'ui.interactionDecline')
    expect(decline).toBeDefined()
    const declined = session.resolveChoice(offered.interaction.playerIndex, decline!.value)
    expect(declined.ok, declined.error).toBe(true)
    const response = confirmNextPlayer(session)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round, JSON.stringify(response.interaction)).toBe(7)
    expect(workersAtHome(response.state, response.state.players[0]!)).toHaveLength(2)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
  })

  it('D022 S8: before the target round Work Permit offers no extra placement', () => {
    const session = setupDue({ wood: 1, clay: 1 })
    const response = session.performRoundEnd()

    expect(response.state.round).toBe(6)
    expect(response.interaction.stateId !== 'wait' || response.interaction.sourceCard !== CARD_ID).toBe(true)
    expect(workPermitRounds(session, response)).toEqual([7])
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.players[0]!.workers.find((worker) => worker.id === '3')?.supplyUse?.status).toBe('reserved')
  })
})

describe('ae-negative-32-supply', () => {
  const { sessions, save, pendingCard, finish, progress, buy, permit, supplyPlace } = audit32Supply
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D022 N1 actual one resource purchase pays one food and its exact reserved supply person acts in the next natural round without spending a family person', () => { const s = permit(), bought = finish(s, buy(s, 'D022_WorkPermit')), id = bought.state.players[0]!.cardStates.D022_WorkPermit?.extraData?.reservedWorkerId; assert.ok(typeof id === 'string'); assert.equal(bought.state.players[0]!.resources.food, 99); assert.equal(bought.state.players[0]!.resources.wood, 1); const due = progress(s, 6, 'D022_WorkPermit'), steps = supplyPlace(s, 'D022_WorkPermit'); assert.equal(steps.r.state.actionSpaces.find(a => a.id === 'day-laborer')!.takenBy[0]!.workerId, id); assert.deepEqual([familySize(steps.r.state.players[0]!), workersAvailable(steps.r.state, steps.r.state.players[0]!), steps.r.state.players[0]!.resources.food], [2, 2, 101]); const later = progress(s, 7, 'D022_WorkPermit'); assert.equal(pendingCard(later, 'D022_WorkPermit'), false); assert.equal(later.state.players[0]!.workers.length, 5); assert.equal(familySize(later.state.players[0]!), 2); save('D022-N1', { bought, due, steps, later }); });
  it('D022 N2 every building resource unit determines the later round once and is not paid as the card fee', () => { const s = permit(true), bought = finish(s, buy(s, 'D022_WorkPermit')); assert.deepEqual([bought.state.players[0]!.resources.wood, bought.state.players[0]!.resources.clay, bought.state.players[0]!.resources.reed, bought.state.players[0]!.resources.stone], [1, 2, 1, 0]); assert.equal(bought.state.players[0]!.cardStates.D022_WorkPermit?.extraData?.targetRound, 9); const due = progress(s, 9, 'D022_WorkPermit'); assert.equal(due.state.round, 9); const steps = supplyPlace(s, 'D022_WorkPermit'); assert.equal(familySize(steps.r.state.players[0]!), 2); assert.equal(workersAvailable(steps.r.state, steps.r.state.players[0]!), 2); save('D022-N2', { bought, due, steps }); });
  it('D022 N3 zero building resources and no finite supply person prevent purchase without spending food', () => { const rows = []; for (const [supply, resources] of [[true, false], [false, true]]) {
      const s = permit(false, 12, supply, resources), p = buy(s, 'D022_WorkPermit');
      assert.ok(p.state.players[0]!.minorHand.includes('D022_WorkPermit'));
      const bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D022_WorkPermit'));
      assert.equal(p.state.players[0]!.resources.food, 100);
      assert.equal(p.state.players[0]!.workers.length, 5);
      rows.push({ p, bad });
  } save('D022-N3', rows); });
  it('D022 N4 a target beyond round fourteen pays the printed fee but neither clamps nor reserves a person', () => { const s = permit(false, 14), r = finish(s, buy(s, 'D022_WorkPermit')); assert.ok(r.state.players[0]!.minorPlayed.includes('D022_WorkPermit')); assert.equal(r.state.players[0]!.resources.food, 99); assert.equal(r.state.players[0]!.cardStates.D022_WorkPermit?.extraData?.targetRound, undefined); assert.ok(r.state.players[0]!.workers.every(w => !w.supplyUse)); save('D022-N4', r); });
})
