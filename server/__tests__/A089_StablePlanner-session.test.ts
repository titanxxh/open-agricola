import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A089_StablePlanner'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectFarmSelection, expectTileFarmSelection, passPreparationExchanges } from './_helpers/session-assertions'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A089_StablePlanner'

const FILLER = '__test_placeholder__'

const setup = ({ round = 2, reserveStables = 4 }: { round?: number; reserveStables?: number } = {}) => {
  const session = evidence.track(createWorkSession({ seed: 6089 + round, options: { playerCount: 2 } }))
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
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  expect(option).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const chooseSchedule = (session: GameSession, response: SessionResponse, count: number) => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => {
    return candidate.value !== '__skip__'
      && candidate.labelParams?.count === count
  }) ?? getChoiceOptions(response)?.filter((candidate) => candidate.value !== '__skip__')[count - 1]
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
    expect(getChoiceOptions(played)?.filter((option) => option.value !== '__skip__')).toHaveLength(2)

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
    const accept = getChoiceOptions(response)?.find((option) => !option.disabled && option.sourceCard === CARD_ID)
    expect(accept).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, accept!.value)
    expect(response.interaction).toMatchObject({
      stateId: 'wait', promptKey: 'ui.interactionStableSelect',
    })
    if (response.interaction.stateId !== 'wait') return
    const stable = expectTileFarmSelection(response, 'stable').selectableTiles[0]
    expect(stable).toBeDefined()
    response = session.commitSelectionChoice(response.interaction.playerIndex, { stables: [stable!] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.stableTiles).toHaveLength(1)
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(scheduledRounds(response)).toEqual([])
  })
})

describe('A089 rule boundaries', () => {

  const A089 = 'A089_StablePlanner'

  const D102 = 'D102_SampleStableMaker'

  const B027 = 'B027_Toolbox'

  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r }

  function setup({ card = A089, round = 1, stableCount = 0, toolbox = false, resources = {} }: {
    card?: string
    round?: number
    stableCount?: number
    toolbox?: boolean
    resources?: Partial<PlayerState['resources']>
  } = {}) {
    const s = evidence.track(createWorkSession({
      seed: 42, configure: state => {
        state.round = round
        state.players.forEach(p => { p.resources.food = 40 })
        const p = state.players[0]!
        p.occupationHand = card === A089 ? [A089] : ['__test_placeholder__']
        p.occupationPlayed = card === D102 ? [D102] : []
        p.minorPlayed = toolbox || card === B027 ? [B027] : []
        if (card === D102) {
          p.minorHand = ['D076_SocialBenefits']
          p.resources.reed = 1
        }
        Object.assign(p.resources, resources)
        p.stableTiles = Array.from({ length: stableCount }, (_, col) => ({ row: 0, col: col + 1 }))
      }
    }))
    return s
  }

  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    const option = getChoiceOptions(r).find(predicate)
    assert.ok(option, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(r.interaction.playerIndex, option.value))
  }

  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }

  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)) }

  function playPlanner(s: GameSession) {
    const r = ok(s.takeAction(0, 'lessons'))
    assert.ok(r.state.players[0]!.occupationPlayed.includes(A089))
    return r
  }

  function schedule(session: GameSession, response: SessionResponse, count: number) {
    const interaction = response.interaction
    assert.ok(interaction.stateId === 'wait' && interaction.request.kind === 'choice')
    const options = getChoiceOptions(response).filter(option => option.sourceCard === A089
      && option.effectPreview?.kind === 'futureSchedule' && option.effectPreview.entries.length === count)
    assert.equal(options.length, 1, JSON.stringify(interaction))
    const scheduled = ok(session.resolveChoice(0, options[0]!.value))
    assert.ok(scheduled.interaction.stateId === 'wait' && scheduled.interaction.request.kind === 'confirm-next-player', JSON.stringify(scheduled.interaction))
    assert.equal(scheduled.interaction.playerIndex, 0)
    assert.equal(scheduled.state.currentPlayerIndex, 0)
    return scheduled
  }

  function futureRounds(r: SessionResponse) {
    return r.state.futureMeeples.filter(m => m.cardId === A089 && m.resources.stable === 1).map(m => m.round).sort((a, b) => a - b)
  }

  function reachDue(s: GameSession) {
    schedule(s, playPlanner(s), 1)
    turn(s, 1, 'forest')
    turn(s, 0, 'reed-bank')
    const first = turn(s, 1, 'clay-pit')
    let r = confirmNext(s, first)
    assert.equal(r.state.round, 2)
    for (const round of [2, 3]) {
      assert.equal(r.state.players[0]!.stableTiles.length, 0)
      assert.deepEqual(futureRounds(r), [4])
      turn(s, 0, 'grain-seeds')
      turn(s, 1, 'forest')
      turn(s, 0, 'day-laborer')
      r = confirmNext(s, turn(s, 1, 'clay-pit'))
      assert.equal(r.state.round, round + 1)
    }
    assert.equal(r.state.players[0]!.resources.wood, 0)
    r = choose(s, r, o => o.sourceCard === A089 || o.value === A089)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'stable')
    return r
  }

  it("reservation respects finite supply and undo restores scheduled tokens", () => {
    const s = setup({ stableCount: 2 })
    const before = undoRuleSnapshot(s.getState())
    const offer = playPlanner(s)
    assert.ok(offer.interaction.stateId === 'wait' && offer.interaction.request.kind === 'choice')
    assert.equal(getChoiceOptions(offer).filter(o => o.value !== '__skip__').length, 2)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, '__A089_forbidden_three__'))
    const r = schedule(s, s.getState(), 2)
    assert.deepEqual(futureRounds(r), [4, 7])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 0)
    assert.equal(r.state.players[0]!.stableTiles.length, 2)
    const undone = s.undoAction()
    assertUndoRestored(before, undone)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    const retry = schedule(s, playPlanner(s), 2)
    assert.deepEqual(futureRounds(retry), [4, 7])
    assert.ok(retry.scores && retry.scores.length === 2)
  })

  it("round eleven preserves only real round fourteen target", () => {
    const s = setup({ round: 11 })
    const offer = playPlanner(s)
    assert.ok(offer.interaction.stateId === 'wait' && offer.interaction.request.kind === 'choice')
    assert.equal(getChoiceOptions(offer).filter(o => o.value !== '__skip__').length, 1)
    const r = schedule(s, offer, 1)
    assert.deepEqual(futureRounds(r), [14])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 3)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })

  it("round twelve invents no future stable and preserves all supply", () => {
    const s = setup({ round: 12 })
    const r = playPlanner(s)
    assert.deepEqual(futureRounds(r), [])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 4)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })

  it("actual due round builds free after rejecting occupied room tile", () => {
    const s = setup()
    const r = reachDue(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'stable')
    const tile = expectTileFarmSelection(r, 'stable').selectableTiles[0]!
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 1, col: 0 }] }))
    const built = ok(s.commitSelectionChoice(0, { stables: [tile] }))
    assert.equal(built.state.players[0]!.stableTiles.length, 1)
    assert.equal(built.state.players[0]!.resources.wood, 0)
    assert.deepEqual(futureRounds(built), [])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(built.state, built.state.players[0]!)), 3)
    assert.ok(built.state.log.some(l => l.key === 'log.cardTriggered' || l.key === 'log.cardEffectGain' || l.key === 'log.actionDetail'))
    assert.equal(passPreparationExchanges(s, built).interaction.stateId, 'idle')
  })

  it("duplicate due stable coordinate cannot create two pieces", () => {
    const s = setup()
    const r = reachDue(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && expectFarmSelection(r).farmType === 'stable')
    const tile = expectTileFarmSelection(r, 'stable').selectableTiles[0]!
    const supply = () => s.withCtx(() => getAvailableStableSupplyCount(s.state, s.state.players[0]!))
    assert.equal(supply(), 3)
    const duplicate = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [tile, tile] }))
    const outcome = { accepted: duplicate.ok, pieces: duplicate.state.players[0]!.stableTiles.length }
    assert.equal(duplicate.ok, false)
    assert.deepEqual(futureRounds(duplicate), [4])
    assert.equal(supply(), 3)
    const retry = ok(s.commitSelectionChoice(0, { stables: [tile] }))
    assert.equal(retry.state.players[0]!.stableTiles.length, 1)
    assert.equal(retry.state.players[0]!.resources.wood, 0)
    assert.deepEqual(futureRounds(retry), [])
    assert.equal(supply(), 3)
    assert.deepEqual(outcome, { accepted: false, pieces: 0 })
    assert.deepEqual(retry.state.players[0]!.stableTiles, [tile])
    assert.equal(passPreparationExchanges(s, retry).interaction.stateId, 'idle')
  })

  it("full reserve schedules all three exact targets without duplicate tokens", () => {
    const s = setup()
    const r = schedule(s, playPlanner(s), 3)
    assert.deepEqual(futureRounds(r), [4, 7, 10])
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[0]!)), 1)
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
})
