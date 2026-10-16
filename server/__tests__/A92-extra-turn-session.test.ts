import { describe, it, expect } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, setActiveWorkerCount, setWorkersAtHome, workersAvailable, newbornCount } from '../../shared/domain/player'
import { hasPendingExtraTurn } from '../../shared/cards/card-effects'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A092_AdoptiveParents'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, passPreparationExchanges, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { getRoundPlacementDetails } from '../../shared/cards/helpers/round-placement'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const A92 = 'A092_AdoptiveParents'
const placeholderHands = (state: {
  players: { minorHand: string[]; occupationHand: string[] }[]
}) => {
  for (const p of state.players) {
    p.minorHand = ['__test_placeholder__']
    p.occupationHand = ['__test_placeholder__']
  }
}
const reqKind = (r: SessionResponse): string | undefined =>
  r.interaction.stateId === 'wait' ? r.interaction.request.kind : undefined
const optValues = (r: SessionResponse): string[] => r.interaction.stateId === 'wait' ? (getChoiceOptions(r) ?? []).map((o) => o.value) : []
const optLabels = (r: SessionResponse): (string | undefined)[] => r.interaction.stateId === 'wait' ? (getChoiceOptions(r) ?? []).map((o) => o.labelKey) : []
const branchValue = (r: SessionResponse, index: number): string => {
  const opts = r.interaction.stateId === 'wait' ? (getChoiceOptions(r) ?? []) : []
  const found = opts[index]
  if (!found) throw new Error(`no XOR branch at index ${index}; got ${JSON.stringify(opts)}`)
  return found.value
}
const setupRotation = (opts: {
  food?: number
  newborns?: number
  p1Workers?: number
  adultWorkers?: number
  round?: number
  forfeited?: boolean
  holdA92?: boolean
} = {}) => {
  const food = opts.food ?? 3
  const newborns = opts.newborns ?? 1
  const p1Workers = opts.p1Workers ?? 1
  const adultWorkers = opts.adultWorkers ?? 0
  const holdA92 = opts.holdA92 ?? true
  const session = sessionEvidence.track(createWorkSession({ options: { playerCount: 2 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 1
  state.round = opts.round ?? 1
  state.roundPhase = 'work'
  const p0 = state.players[0]!
  setActiveWorkerCount(p0, Math.max(1, newborns + adultWorkers))
  setWorkersAtHome(state, p0, 0)
  const parkSpaces = ['forest', 'clay-pit', 'reed-bank', 'fishing']
  const active = p0.workers
    .filter((w) => w.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  active.forEach((worker, index) => {
    worker.isNewborn = index < newborns
  })
  for (let i = 0; i < newborns && i < active.length; i++) {
    const w = active[i]!
    w.isNewborn = true
    const sp = state.actionSpaces.find((a) => a.id === parkSpaces[i])!
    sp.takenBy = [{ playerId: p0.id, workerId: w.id }]
  }
  if (holdA92) p0.occupationPlayed.push(A92)
  p0.resources.food = food
  if (opts.forfeited) {
    p0.cardStates = {
      ...(p0.cardStates ?? {}),
      [A92]: { extraData: { forfeitedThisRound: true } },
    }
  }
  const p1 = state.players[1]!
  setActiveWorkerCount(p1, p1Workers)
  setWorkersAtHome(state, p1, p1Workers)
  placeholderHands(state)
  session.loadState(state)
  return session
}
const setupPlayedAfterGrowth = () => {
  const session = sessionEvidence.track(createWorkSession({ seed: 1, options: { playerCount: 2 } }))
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 2
  state.roundPhase = 'work'
  placeholderHands(state)
  const player = state.players[0]!
  setActiveWorkerCount(player, 3)
  const workers = player.workers
    .filter((worker) => worker.isActive)
    .sort((a, b) => Number(a.id) - Number(b.id))
  workers.forEach((worker) => {
    worker.isNewborn = false
  })
  workers[2]!.isNewborn = true
  state.actionSpaces.find((space) => space.id === 'forest')!.takenBy = [
    { playerId: player.id, workerId: workers[0]!.id },
  ]
  state.actionSpaces.find((space) => space.id === 'wish-children')!.takenBy = [
    { playerId: player.id, workerId: workers[2]!.id },
  ]
  player.occupationHand = [A92]
  player.resources.food = 3
  const opponent = state.players[1]!
  setActiveWorkerCount(opponent, 1)
  setWorkersAtHome(state, opponent, 1)
  session.loadState(state)
  return session
}
const placeableSpaces = (session: GameSession) =>
  session
    .getState()
    .state.actionSpaces.filter(
      (a) =>
        a.id !== '__test-worker-sink__' &&
        (!a.takenBy || a.takenBy.length === 0) &&
        (a.roundAvailable ?? 1) <= session.getState().state.round,
    )
    .map((a) => a.id)
const drainConfirms = (session: GameSession, start: SessionResponse): SessionResponse => {
  let r = start
  let guard = 0
  while (reqKind(r) === 'confirm-next-player' && guard++ < 8) {
    const owner = r.interaction.stateId === 'wait' ? r.interaction.playerIndex : session.getState().state.currentPlayerIndex
    r = session.resolveChoice(owner, 'confirm')
  }
  return r
}
const driveToP0ExtraTurn = (session: GameSession): SessionResponse => {
  const taken = session.takeAction(1, placeableSpaces(session)[0]!)
  expect(taken.ok).toBe(true)
  return drainConfirms(session, taken)
}
describe('A92 AdoptiveParents — extra-turn (capability B)', () => {
  it('A092 S1: Adoptive Parents played after growth can trigger in the same work phase', () => {
    const session = setupPlayedAfterGrowth()

    const played = session.takeAction(0, 'lessons')
    expect(played.ok).toBe(true)
    expect(played.state.players[0]!.occupationPlayed).toContain(A92)
    expect(newbornCount(played.state.players[0]!)).toBe(1)
    expect(session.withCtx(() => hasPendingExtraTurn(played.state, played.state.players[0]!))).toBe(true)

    drainConfirms(session, played)
    const opponentAction = session.takeAction(1, placeableSpaces(session)[0]!)
    expect(opponentAction.ok).toBe(true)
    const offer = drainConfirms(session, opponentAction)
    expect(reqKind(offer)).toBe('choice')

    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    expect(used.state.round).toBe(2)
    expect(used.state.players[0]!.resources.food).toBe(2)
    expect(newbornCount(used.state.players[0]!)).toBe(0)
    expect(['farm-select', 'choice']).toContain(reqKind(used))
  })
  it('rotation STOPS on the out-of-workers A92 player and offers use/forfeit', () => {
    const session = setupRotation()
    const pre = session.getState()
    expect(workersAvailable(pre.state, pre.state.players[0]!)).toBe(0)
    expect(session.withCtx(() => hasPendingExtraTurn(pre.state, pre.state.players[0]!))).toBe(true)

    const r = driveToP0ExtraTurn(session)
    expect(session.getState().state.currentPlayerIndex).toBe(0)
    expect(reqKind(r)).toBe('choice')
    // Two XOR branches in flow order: branch 0 = use (its first leaf is the food
    // payment), branch 1 = forfeit (its leaf is the set-extra-data effect). OA
    // labels a composite branch by its first leaf's action and addresses
    // branches by node-id value, so tests select by position, not by '0'/'1'.
    expect(optValues(r)).toHaveLength(2)
    expect(optLabels(r)).toEqual(['actions.pay.name', 'actions.special-effect.name'])
  })
  it('A092 S2: after rotation passed the owner, accepting promotes and immediately places the child', () => {
    const session = setupRotation({ food: 3 })
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    const foodBefore = session.getState().state.players[0]!.resources.food
    expect(newbornCount(session.getState().state.players[0]!)).toBe(1)

    // Choose "use": pay + promote → the promoted worker is offered a placement
    // prompt (resolvable by space id; OA renders it as a 'choice' of spaces).
    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    expect(['farm-select', 'choice']).toContain(reqKind(used))
    expect(used.state.players[0]!.resources.food).toBe(foodBefore - 1)
    // Promoted: no longer a newborn, now an available worker awaiting placement.
    expect(newbornCount(used.state.players[0]!)).toBe(0)
    expect(workersAvailable(used.state, used.state.players[0]!)).toBe(1)

    // Resolve the placement onto a real action space.
    const placed = session.resolveChoice(0, placeableSpaces(session)[0]!)
    expect(placed.ok).toBe(true)
    const after = session.getState()
    expect(workersAvailable(after.state, after.state.players[0]!)).toBe(0)
    expect(session.withCtx(() => hasPendingExtraTurn(after.state, after.state.players[0]!))).toBe(false)
  })
  it('A092 S5: two newborns can each be promoted for one food in the same round', () => {
    const session = setupRotation({ food: 3, newborns: 2 })
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')

    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    const afterUse = session.getState()
    expect(afterUse.state.players[0]!.resources.food).toBe(2)
    expect(newbornCount(afterUse.state.players[0]!)).toBe(1)
    expect(session.withCtx(() => hasPendingExtraTurn(afterUse.state, afterUse.state.players[0]!))).toBe(true)
    expect(session.getState().state.currentPlayerIndex).toBe(0)

    const firstPlaced = session.resolveChoice(0, placeableSpaces(session)[0]!)
    expect(firstPlaced.ok).toBe(true)
    const secondOffer = drainConfirms(session, firstPlaced)
    expect(secondOffer.state.round).toBe(1)
    expect(reqKind(secondOffer)).toBe('choice')

    const secondUse = session.resolveChoice(0, branchValue(secondOffer, 0))
    expect(secondUse.ok).toBe(true)
    expect(secondUse.state.round).toBe(1)
    expect(secondUse.state.players[0]!.resources.food).toBe(1)
    expect(newbornCount(secondUse.state.players[0]!)).toBe(0)
    expect(['farm-select', 'choice']).toContain(reqKind(secondUse))
  })
  it('A092 S3: declining use leaves food and the newborn unchanged', () => {
    const session = setupRotation()
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    const foodBefore = offer.state.players[0]!.resources.food

    // Choose "forfeit" (branch 1).
    const forfeited = session.resolveChoice(0, branchValue(offer, 1))
    expect(forfeited.ok).toBe(true)

    const after = session.getState()
    expect(after.state.players[0]!.resources.food).toBe(foodBefore)
    expect(after.state.players[0]!.cardStates?.[A92]?.extraData?.forfeitedThisRound).toBe(true)
    // Offspring still parked but no longer offered.
    expect(newbornCount(after.state.players[0]!)).toBe(1)
    expect(session.withCtx(() => hasPendingExtraTurn(after.state, after.state.players[0]!))).toBe(false)
  })
  it('ROUND CLOSE: forfeiting the last extra turn ends the round (no early end, no loop)', () => {
    const session = setupRotation()
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    const forfeited = session.resolveChoice(0, branchValue(offer, 1))
    expect(forfeited.ok).toBe(true)

    const after = drainConfirms(session, forfeited)
    expect(session.withCtx(() => hasPendingExtraTurn(after.state, after.state.players[0]!))).toBe(false)
    // No player owed a worker or extra turn → work phase completed, round advanced.
    expect(after.state.round).toBe(2)
  })
  it('A092 S4: no newborn or zero food exposes no usable Adoptive Parents branch', () => {
    const session = setupRotation({ newborns: 0, p1Workers: 1 })
    // setupRotation forces ≥1 newborn; scrub P0 to a clean "no offspring" state.
    const st = session.getState().state
    const p0 = st.players[0]!
    for (const w of p0.workers) w.isNewborn = false
    for (const sp of st.actionSpaces) {
      if (sp.takenBy)
        sp.takenBy = sp.takenBy.filter((t) => t.playerId !== p0.id)
    }
    setActiveWorkerCount(p0, 0)
    session.loadState(st)
    const start = session.getState()
    expect(newbornCount(start.state.players[0]!)).toBe(0)
    expect(session.withCtx(() => hasPendingExtraTurn(start.state, start.state.players[0]!))).toBe(false)
    const taken = session.takeAction(1, placeableSpaces(session)[0]!)
    expect(taken.ok).toBe(true)
    const after = drainConfirms(session, taken)
    expect(reqKind(after)).not.toBe('choice')
    expect(after.state.round).toBe(2)
    const noFood = setupRotation({ food: 0, p1Workers: 2 })
    const snap = noFood.getState()
    expect(newbornCount(snap.state.players[0]!)).toBe(1)
    expect(noFood.withCtx(() => hasPendingExtraTurn(snap.state, snap.state.players[0]!))).toBe(false)
    const noFoodAction = noFood.takeAction(1, placeableSpaces(noFood)[0]!)
    expect(noFoodAction.ok).toBe(true)
    const afterNoFood = drainConfirms(noFood, noFoodAction)
    expect(reqKind(afterNoFood)).not.toBe('choice')
    expect(afterNoFood.state.players[0]!.resources.food).toBe(0)
    expect(newbornCount(afterNoFood.state.players[0]!)).toBe(1)
  })
  it('A092 S6: a promoted child is fed as an adult in the harvest', () => {
    const session = setupRotation({
      food: 7,
      newborns: 1,
      adultWorkers: 2,
      p1Workers: 1,
      round: 4,
    })
    const offer = driveToP0ExtraTurn(session)
    expect(reqKind(offer)).toBe('choice')
    expect(familySize(offer.state.players[0]!)).toBe(3)

    const used = session.resolveChoice(0, branchValue(offer, 0))
    expect(used.ok).toBe(true)
    expect(used.state.players[0]!.resources.food).toBe(6)
    expect(newbornCount(used.state.players[0]!)).toBe(0)

    const placed = session.resolveChoice(0, placeableSpaces(session)[0]!)
    expect(placed.ok).toBe(true)
    const afterHarvest = autoAdvanceRoundEnd(session)

    expect(afterHarvest.state.round).toBe(5)
    expect(familySize(afterHarvest.state.players[0]!)).toBe(3)
    expect(newbornCount(afterHarvest.state.players[0]!)).toBe(0)
    expect(afterHarvest.state.players[0]!.resources.food).toBe(0)
    expect(afterHarvest.state.players[0]!.resources.begging).toBe(0)
  })
  it('NOT TRIGGERED: already forfeited this round → not offered', () => {
    const session = setupRotation({ forfeited: true })
    const snap = session.getState()
    expect(session.withCtx(() => hasPendingExtraTurn(snap.state, snap.state.players[0]!))).toBe(false)
  })
  it('NOT TRIGGERED: A92 on the opponent does not affect this player', () => {
    const session = setupRotation({ holdA92: false })
    const st = session.getState().state
    st.players[1]!.occupationPlayed.push(A92)
    st.players[1]!.resources.food = 5
    session.loadState(st)
    const snap = session.getState()
    expect(session.withCtx(() => hasPendingExtraTurn(snap.state, snap.state.players[0]!))).toBe(false)
    expect(session.withCtx(() => hasPendingExtraTurn(snap.state, snap.state.players[1]!))).toBe(false)
  })
  it('CROSS-ROUND: forfeitedThisRound gates this round, clears for the next', () => {
    const session = setupRotation({ forfeited: true })
    const before = session.getState()
    expect(before.state.players[0]!.cardStates?.[A92]?.extraData?.forfeitedThisRound).toBe(true)
    expect(session.withCtx(() => hasPendingExtraTurn(before.state, before.state.players[0]!))).toBe(false)

    // onRoundStart clears the flag; availability returns (offspring + food remain).
    const player = before.state.players[0]!
    player.cardStates![A92]!.extraData!.forfeitedThisRound = false
    expect(session.withCtx(() => hasPendingExtraTurn(before.state, player))).toBe(true)
  })
})
describe("A092 command boundaries", () => {
  const PARENTS = 'A092_AdoptiveParents', BED = 'A093_BedMaker'
  const ANY = 'A92-adoptive-parents-anytime-grow', WAGE = 'B007_Wage'
  function record(name: string, response: SessionResponse) {
    sessionEvidence.record(name, response)
    return response
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  const rooms = [{ row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }]
  type Options = {
    played?: boolean
    roomCount?: number
    people?: number
    house?: 'wood' | 'clay' | 'stone'
    round?: number
    resources?: Partial<Resource>
  }
  function setup({ played = true, roomCount = 2, people = 2, house = 'wood', round = 7, resources = {} }: Options = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        for (const p of state.players) {
          p.minorHand = [WAGE]
          p.occupationHand = ['A111_WallBuilder']
          Object.assign(p.resources, { food: 30, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        }
        const p = state.players[0]!
        p.occupationPlayed = played ? ["A092_AdoptiveParents"] : []
        p.occupationHand = played ? ['A111_WallBuilder'] : ["A092_AdoptiveParents", 'A111_WallBuilder']
        p.rooms = roomCount
        p.roomTiles = rooms.slice(0, roomCount).map(t => ({ ...t }))
        p.houseType = house
        setActiveWorkerCount(p, people)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    for (const p of s.state.players)
      assert.equal(p.workers.length, 5)
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, accept = true, actor = 0) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, BED)
    assert.equal(r.interaction.promptKey, 'ui.interactionOptionalAction')
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    const payments = options(r).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(payments.length, 1)
    const payment = payments[0]!
    assert.equal(payment.sourceCard, BED)
    assert.equal(payment.labelKey, 'actions.pay.name')
    assert.ok(payment.effectPreview?.kind === 'payment')
    assert.deepEqual(payment.effectPreview.resourcesPaid, { wood: 1, grain: 1 })
    assert.equal(options(r).length, 2)
    assert.ok(options(r).some(option => option.value === '__skip__' && !option.disabled))
    return record('choice', ok(s.resolveChoice(actor, accept ? payment.value : '__skip__')))
  }
  function finish(r: SessionResponse, actor = 0) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function assertPlacements(r: SessionResponse, expected: ReturnType<typeof getRoundPlacementDetails>, parked: ReturnType<typeof getRoundPlacementDetails> = []) {
    const player = r.state.players[0]!
    assert.deepEqual(getRoundPlacementDetails(player), expected)
    const physical = r.state.actionSpaces.flatMap(space => space.takenBy
      .filter(worker => worker.playerId === player.id)
      .map(worker => ({ spaceId: space.id, workerId: worker.workerId })))
    const byWorker = (a: { workerId: string }, b: { workerId: string }) => a.workerId.localeCompare(b.workerId)
    assert.deepEqual(physical.sort(byWorker), [...expected, ...parked].sort(byWorker))
    assert.deepEqual(player.workers.map(worker => worker.id), ['1', '2', '3', '4', '5'])
  }
  function assertConfirmation(r: SessionResponse, actor: number, nextActor: number) {
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.ok(r.interaction.stateId === 'wait', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.deepEqual(r.interaction.request, { kind: 'confirm-next-player', nextPlayerIndex: nextActor })
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const response = record(`take:${space}`, ok(s.takeAction(actor, space)))
    return space === 'wish-children' || space === 'farm-expansion' ? response : finish(response, actor)
  }
  function growth(s: GameSession) {
    const pending = turn(s, 0, 'wish-children')
    assert.ok(pending.interaction.stateId === 'wait' && pending.interaction.request.kind === 'choice', JSON.stringify(pending.interaction))
    assert.equal(pending.interaction.sourceCard, undefined)
    assert.equal(pending.interaction.promptKey, 'ui.interactionOptionalAction')
    assert.equal(pending.interaction.playerIndex, 0)
    assert.equal(pending.state.currentPlayerIndex, 0)
    const improvement = options(pending).filter(option => option.value !== '__skip__' && !option.disabled)
    assert.equal(improvement.length, 1)
    assert.equal(improvement[0]!.labelKey, 'actions.improvement.name')
    assert.ok(options(pending).some(option => option.value === '__skip__' && !option.disabled))
    return finish(record('decline-minor', ok(s.resolveChoice(0, '__skip__'))))
  }
  function values(r: SessionResponse) {
    const p = r.state.players[0]!
    return { rooms: p.rooms, family: familySize(p), newborns: newbornCount(p), wood: p.resources.wood, reed: p.resources.reed, grain: p.resources.grain, food: p.resources.food }
  }
  function build(s: GameSession, tiles = [rooms[2]!], actor = 0, stable = false) {
    let r = turn(s, actor, 'farm-expansion')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const c = getChoiceOptions(r).find(o => o.labelKey === 'actions.construct.name')
      assert(c, JSON.stringify(r.interaction))
      r = record('construct-branch', ok(s.resolveChoice(actor, c.value)))
    }
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
    assert.equal(r.interaction.request.farm.farmType, stable ? 'stable' : 'room')
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return record('construct', ok(s.commitSelectionChoice(actor, stable ? { rooms: [], stables: tiles } : { rooms: tiles, stables: [] })))
  }
  function bed(s: GameSession, tiles = [rooms[2]!], accept = true) {
    let r = build(s, tiles)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === BED, JSON.stringify(r.interaction))
    r = choose(s, r, accept)
    return finish(r)
  }
  it("real newborn promotion pays one food and preserves opponent alternation", () => {
    const s = setup({ roomCount: 3, resources: { food: 1 } })
    growth(s)
    assert.equal(newbornCount(s.state.players[0]!), 1)
    const r = record('promote', ok(s.takeAnytimeAction(0, ANY)))
    assert.equal(values(r).food, 0)
    assert.equal(values(r).family, 3)
    assert.equal(values(r).newborns, 0)
    assert.deepEqual(r.state.players[0]!.workers.find(worker => worker.id === '3'), { id: '3', isActive: true, isNewborn: false })
    assertPlacements(r, [{ spaceId: 'wish-children', workerId: '1' }])
    assertConfirmation(r, 0, 1)
    ready(s, 1)
    assert.equal(workersAvailable(s.state, s.state.players[0]!), 2)
    turn(s, 1, 'forest')
    turn(s, 0, 'reed-bank')
    assert.equal(workersAvailable(s.state, s.state.players[0]!), 1)
    record('duplicate-no-newborn', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY)))
  })
  it("actual newborn with zero own food cannot use opponents food", () => {
    const s = setup({ roomCount: 3, resources: { food: 0 } })
    growth(s)
    record('no-food', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY)))
    assert.equal(newbornCount(s.state.players[0]!), 1)
    assert.equal(values(s.getState()).food, 0)
  })
  it("unplayed Parents cannot activate a real newborn", () => {
    const s = setup({ played: false, roomCount: 3, resources: { food: 1 } })
    growth(s)
    record('unplayed-parents', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY)))
    assert.equal(newbornCount(s.state.players[0]!), 1)
    assert.equal(values(s.getState()).food, 1)
  })
  it("no newborn means no activation or food payment", () => {
    const s = setup({ roomCount: 3, resources: { food: 1 } })
    const rejected = record('no-child', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY)))
    assert.equal(rejected.interaction.stateId, 'idle')
    assert.equal(rejected.state.currentPlayerIndex, 0)
    assert.equal(values(s.getState()).food, 1)
  })
  function placementOffer(r: SessionResponse, space: string) {
    ok(r)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, PARENTS)
    assert.equal(r.interaction.promptKey, 'ui.interactionPlaceFarmerExtra')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.ok(options(r).some(option => option.value === space && !option.disabled))
  }
  function lastOrdinary(s: GameSession) {
    growth(s)
    turn(s, 1, 'forest')
    turn(s, 0, 'reed-bank')
    const last = turn(s, 1, 'clay-pit')
    return record('extra-turn-offer', confirmNext(s, last))
  }
  function nextRound(s: GameSession, r: SessionResponse, expected: 'exchange' | 'idle') {
    assertConfirmation(r, 0, 0)
    let next = record('round-confirm', ok(confirmNext(s, r)))
    if (expected === 'exchange') {
      assert.equal(next.state.round, 7)
      assert.equal(next.state.roundPhase, 'preparation')
      assert.ok(next.interaction.stateId === 'wait' && next.interaction.request.kind === 'select-trigger', JSON.stringify(next.interaction))
      assert.equal(next.interaction.playerIndex, 0)
      assert.equal(next.interaction.spaceId, '__stage:onBeforeStartOfTurn')
      assert.equal(next.state.currentPlayerIndex, 0)
      assert.ok(next.interaction.request.options.every(option => !option.disabled))
      assert.deepEqual(next.interaction.request.options.map(option => option.labelKey), ['actions.exchange.name', 'ui.interactionSelectTriggerPass'])
      next = passPreparationExchanges(s, next)
    }
    assert.equal(next.state.round, 8)
    assert.equal(next.state.roundPhase, 'work')
    assert.equal(next.interaction.stateId, 'idle', JSON.stringify(next.interaction))
    assert.equal(next.state.currentPlayerIndex, 0)
    return next
  }
  function extraOffer(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    assert.equal(r.interaction.sourceCard, PARENTS)
    assert.equal(r.interaction.promptKey, 'ui.interactionFlowSelect')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    const candidates = options(r)
    assert.equal(candidates.length, 2)
    assert.ok(candidates.every(option => !option.disabled && option.sourceCard === PARENTS))
    const use = candidates.find(option => option.labelKey === 'actions.pay.name')
    const decline = candidates.find(option => option.labelKey === 'actions.special-effect.name')
    assert.ok(use?.effectPreview?.kind === 'payment')
    assert.deepEqual(use.effectPreview.resourcesPaid, { food: 1 })
    assert.ok(decline?.descriptionPreview?.kind === 'action')
    assert.equal(decline.descriptionPreview.labelKey, 'actions.special-effect.emit-card-triggered.declined.name')
    return { use, decline }
  }
  it("last-worker activation feeds an adult and records the native extra-turn seam", () => {
    const s = setup({ roomCount: 3, resources: { food: 20 } })
    const offer = lastOrdinary(s)
    assert.equal(newbornCount(s.state.players[0]!), 1)
    assert.equal(workersAvailable(s.state, s.state.players[0]!), 0)
    const { use } = extraOffer(offer)
    record('nested-anytime', assertRejectedUnchanged(s, () => s.takeAnytimeAction(0, ANY)))
    record('wrong-extra-responder', assertRejectedUnchanged(s, () => s.resolveChoice(1, use.value)))
    let r = record('extra-use', ok(s.resolveChoice(0, use.value)))
    assert.equal(values(r).food, 19)
    assert.equal(values(r).newborns, 0)
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.ok(r.interaction.stateId === 'wait')
    assert.equal(r.interaction.playerIndex, 0)
    assert.equal(r.interaction.promptKey, 'ui.interactionPlaceFarmerExtra')
    assertPlacements(r, [{ spaceId: 'wish-children', workerId: '1' }, { spaceId: 'reed-bank', workerId: '2' }])
    placementOffer(r, 'grain-seeds')
    record('occupied-extra-target', assertRejectedUnchanged(s, () => s.resolveChoice(0, 'forest')))
    r = record('extra-placement', ok(s.resolveChoice(0, 'grain-seeds')))
    assert.equal(values(r).grain, 1)
    assert.equal(workersAvailable(s.state, s.state.players[0]!), 0)
    assertPlacements(r, [{ spaceId: 'wish-children', workerId: '1' }, { spaceId: 'reed-bank', workerId: '2' }, { spaceId: 'grain-seeds', workerId: '3' }])
    assertConfirmation(r, 0, 0)
    record('stale-extra-use', assertRejectedUnchanged(s, () => s.resolveChoice(0, use.value)))
    r = nextRound(s, r, 'exchange')
    assert.equal(values(r).food, 13)
    assert.equal(values(r).family, 3)
  })
  it("declining a real birth preserves newborn feeding and records the forfeit seam", () => {
    const s = setup({ roomCount: 3, resources: { food: 20 } })
    const offer = lastOrdinary(s)
    const { decline } = extraOffer(offer)
    const r = record('extra-forfeit', ok(s.resolveChoice(0, decline.value)))
    assert.equal(values(r).food, 20)
    assert.equal(values(r).newborns, 1)
    assertPlacements(r, [{ spaceId: 'wish-children', workerId: '1' }, { spaceId: 'reed-bank', workerId: '2' }], [{ spaceId: 'wish-children', workerId: '3' }])
    assertConfirmation(r, 0, 0)
    const next = nextRound(s, r, 'idle')
    assert.equal(values(next).food, 15)
    assert.equal(next.state.players[0]!.cardStates[PARENTS]?.extraData?.forfeitedThisRound, false)
  })
  it("two actual births each pay once and place one of the finite five farmers", () => {
    const s = setup({ roomCount: 3, resources: { wood: 6, reed: 2, grain: 1 } }, st => st.players[0]!.occupationPlayed.push(BED))
    growth(s)
    turn(s, 1, 'forest')
    bed(s, [rooms[3]!])
    assert.equal(familySize(s.state.players[0]!), 4)
    assert.equal(newbornCount(s.state.players[0]!), 2)
    let r = record('two-child-offer', confirmNext(s, turn(s, 1, 'clay-pit')))
    for (const space of ['grain-seeds', 'day-laborer']) {
      const { use } = extraOffer(r)
      const promoted = record('two-child-use', ok(s.resolveChoice(0, use.value)))
      assert.equal(values(promoted).food, space === 'grain-seeds' ? 29 : 28)
      assert.equal(values(promoted).newborns, space === 'grain-seeds' ? 1 : 0)
      assert.equal(promoted.state.currentPlayerIndex, 0)
      assert.ok(promoted.interaction.stateId === 'wait')
      assert.equal(promoted.interaction.playerIndex, 0)
      assert.equal(promoted.interaction.promptKey, 'ui.interactionPlaceFarmerExtra')
      placementOffer(promoted, space)
      r = record(`two-child-place:${space}`, ok(s.resolveChoice(0, space)))
      if (space === 'grain-seeds') {
        assertPlacements(r, [{ spaceId: 'wish-children', workerId: '1' }, { spaceId: 'farm-expansion', workerId: '2' }, { spaceId: 'grain-seeds', workerId: '3' }], [{ spaceId: 'farm-expansion', workerId: '4' }])
      } else {
        assertPlacements(r, [{ spaceId: 'wish-children', workerId: '1' }, { spaceId: 'farm-expansion', workerId: '2' }, { spaceId: 'grain-seeds', workerId: '3' }, { spaceId: 'day-laborer', workerId: '4' }])
      }
      assertConfirmation(r, 0, 0)
      if (space === 'grain-seeds')
        r = record('second-child-offer', confirmNext(s, r))
    }
    assert.equal(values(r).food, 30)
    assert.equal(values(r).newborns, 0)
    assert.equal(values(r).family, 4)
    r = nextRound(s, r, 'exchange')
    assert.equal(values(r).food, 22)
    assert.equal(values(r).grain, 1)
  })
  it("whole real growth and paid promotion undo restores the birth and payment before one retry", () => {
    const s = setup({ roomCount: 3, resources: { food: 1 } })
    const before = undoRuleSnapshot(s.getState())
    const interactionBefore = structuredClone(s.getState().interaction)
    growth(s)
    record('undo-test-promote', ok(s.takeAnytimeAction(0, ANY)))
    const undone = record('undo-parents', s.undoAction())
    assertUndoRestored(before, undone)
    assertUndoRestored(before, s.getState())
    assert.deepEqual(undone.interaction, interactionBefore)
    assert.deepEqual(s.getState().interaction, interactionBefore)
    assert.equal(undone.interaction.stateId, 'idle')
    assert.equal(undone.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    growth(s)
    const r = record('retry-promote', ok(s.takeAnytimeAction(0, ANY)))
    assertConfirmation(r, 0, 1)
    assert.equal(values(r).food, 0)
    assert.equal(values(r).newborns, 0)
    assert.equal(values(r).family, 3)
  })
})
