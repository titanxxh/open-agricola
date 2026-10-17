import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A089_StablePlanner'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import * as audit03Stables from './_helpers/audit/ae-negative-03-stables'

const CARD_ID = 'A089_StablePlanner'

const FILLER = '__test_placeholder__'

const setup = ({ round = 2, reserveStables = 4 }: { round?: number; reserveStables?: number } = {}) => {
  const session = createWorkSession({ seed: 6089 + round, options: { playerCount: 2 } })
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0,
    }
  })
  const owner = state.players[0]!
  owner.occupationHand = [CARD_ID]
  const usedStables = 4 - reserveStables
  owner.stableTiles = Array.from({ length: usedStables }, (_, index) => ({
    row: index, col: 1,
  }))
  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const chooseSchedule = (session: GameSession, response: SessionResponse, count: number) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => {
    return candidate.value !== '__skip__'
      && candidate.labelParams?.count === count
  }) ?? response.interaction.request.options?.filter((candidate) => candidate.value !== '__skip__')[count - 1]
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const scheduledRounds = (response: SessionResponse) => response.state.futureMeeples
  .filter((entry) => entry.cardId === CARD_ID && entry.resources.stable === 1)
  .map((entry) => entry.round)
  .sort((left, right) => left - right)

describe('A089 Stable Planner parity', () => {
  it('A089 S1: Stable Planner may be played and its scheduling declined', () => {
    const session = setup()
    let response = playOccupation(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return

    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(scheduledRounds(response)).toEqual([])
  })

  it('A089 S2: choosing three in round two schedules stables for rounds five eight and eleven', () => {
    const session = setup()

    const response = chooseSchedule(session, playOccupation(session), 3)

    expect(response.ok, response.error).toBe(true)
    expect(scheduledRounds(response)).toEqual([5, 8, 11])
  })

  it('A089 S3: only two reserve stables cap the available schedule at two', () => {
    const session = setup({ reserveStables: 2 })
    const played = playOccupation(session)
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.options?.filter((option) => option.value !== '__skip__')).toHaveLength(2)

    const response = chooseSchedule(session, played, 2)

    expect(response.ok, response.error).toBe(true)
    expect(scheduledRounds(response)).toEqual([5, 8])
  })

  it('A089 S4: round eleven schedules only the still-existing round fourteen', () => {
    const session = setup({ round: 11 })

    const response = chooseSchedule(session, playOccupation(session), 1)

    expect(response.ok, response.error).toBe(true)
    expect(scheduledRounds(response)).toEqual([14])
  })

  it('A089 S5: a due Stable Planner stable can be built free at round start', () => {
    const session = setup({ round: 3 })
    const scheduled = chooseSchedule(session, playOccupation(session), 1)
    expect(scheduledRounds(scheduled)).toEqual([6])
    const state = session.getState().state
    state.round = 5
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)

    let response = session.performRoundEnd()
    expect(response.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'select-trigger' },
    })
    if (response.interaction.stateId !== 'wait') return
    const accept = response.interaction.request.options?.find((option) => !option.disabled && option.sourceCard === CARD_ID)
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionStableSelect',
    })
    if (response.interaction.stateId !== 'wait') return
    const stable = response.interaction.request.farm.selectableTiles[0]
    expect(stable).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(scheduledRounds(response)).toEqual([])
  })
})

describe('ae-negative-03-stables', () => {
  const { sessions, ok, setup, playPlanner, schedule, futureRounds, reachDue } = audit03Stables
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Stable Planner negative audit', () => {
    it('A089 N1 reservation respects finite supply and undo restores scheduled tokens', () => {
      const s = setup({ stableCount: 2 })
      const before = undoRuleSnapshot(s.getState())
      const offer = playPlanner(s)
      assert.ok(offer.interaction.stateId === 'wait' && offer.interaction.request.kind === 'choice')
      assert.equal(offer.interaction.request.options.filter(o => o.value !== '__skip__').length, 2)
      assertRejectedUnchanged(s, () => s.resolveChoice(0, '__A089_forbidden_three__'))
      const r = schedule(s, s.getState(), 2)
      assert.deepEqual(futureRounds(r), [4, 7])
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 0)
      assert.equal(r.state.players[0]!.stableTiles.length, 2)
      assertUndoRestored(before, s.undoAction())
      const retry = schedule(s, playPlanner(s), 2)
      assert.deepEqual(futureRounds(retry), [4, 7])
      assert.ok(retry.scores && retry.scores.length === 2)
    })
    it('A089 N2 round eleven preserves only real round fourteen target', () => {
      const s = setup({ round: 11 })
      const offer = playPlanner(s)
      assert.ok(offer.interaction.stateId === 'wait' && offer.interaction.request.kind === 'choice')
      assert.equal(offer.interaction.request.options.filter(o => o.value !== '__skip__').length, 1)
      const r = schedule(s, offer, 1)
      assert.deepEqual(futureRounds(r), [14])
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 3)
    })
    it('A089 N3 round twelve invents no future stable and preserves all supply', () => {
      const s = setup({ round: 12 })
      const r = playPlanner(s)
      assert.deepEqual(futureRounds(r), [])
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 4)
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    })
    it('A089 N4 actual due round builds free after rejecting occupied room tile', () => {
      const s = setup()
      const r = reachDue(s)
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
      const tile = r.interaction.request.farm.selectableTiles[0]!
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 1, col: 0 }] }))
      const built = ok(s.commitSelectionChoice(0, { stables: [tile] }))
      assert.equal(built.state.players[0]!.stableTiles.length, 1)
      assert.equal(built.state.players[0]!.resources.wood, 0)
      assert.deepEqual(futureRounds(built), [])
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(built.state, built.state.players[0]!)), 3)
      assert.ok(built.state.log.some(l => l.key === 'log.cardTriggered' || l.key === 'log.cardEffectGain' || l.key === 'log.actionDetail'))
    })
    it('A089 N5 duplicate due stable coordinate cannot create two pieces', () => {
      const s = setup()
      const r = reachDue(s)
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
      const tile = r.interaction.request.farm.selectableTiles[0]!
      const before = undoRuleSnapshot(s.getState())
      const duplicate = s.commitSelectionChoice(0, { stables: [tile, tile] })
      const outcome = { accepted: duplicate.ok, pieces: duplicate.state.players[0]!.stableTiles.length }
      if (!duplicate.ok) {
        assert.equal(undoRuleSnapshot(duplicate), before)
        assert.equal(ok(s.commitSelectionChoice(0, { stables: [tile] })).state.players[0]!.stableTiles.length, 1)
      }
      assertRuleOutcome(outcome, { accepted: false, pieces: 0 })
    })
  })
  it('A089 N6 full reserve schedules all three exact targets without duplicate tokens', () => {
    const s = setup()
    const r = schedule(s, playPlanner(s), 3)
    assert.deepEqual(futureRounds(r), [4, 7, 10])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 1)
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
  })
})
