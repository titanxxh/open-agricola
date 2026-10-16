import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer } from './_helpers/pending-confirms'
import { inactiveWorkersInSupply, workersAtHome, markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome, familySize } from '../../shared/domain/player'
import { chooseSupplyWorkerTurn, takeNormalWorkerTurn } from './_helpers/supply-worker-turn'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { readCardExtraData } from '../../shared/cards/helpers/card-state'
import { maxFences } from '../../shared/actions/effects/fencing'
import '../../shared/cards/A/A022_Telegram'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A022_Telegram'
const FILLER = '__test_placeholder__'

const setupPurchase = ({ round = 1, fencesInSupply = 1 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5022, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources.food = 2
  player.supplyTokensConsumed = { fence: maxFences - fencesInSupply }
  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const enterImprovementChoice = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const improvement = getChoiceOptions(response)?.find((option) =>
    option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}

const play = (session: GameSession): SessionResponse => {
  const response = enterImprovementChoice(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
  if (!option) return response
  return session.resolveChoice(0, option.value)
}

const setupDue = ({ supplyFarmer = true } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 6022, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.round = 1
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.resources.food = 20
    if (!supplyFarmer && player === state.players[0]) setActiveWorkerCount(player, 5)
    markAllWorkersUsed(state, player)
  })
  const player = state.players[0]!
  player.minorPlayed = [CARD_ID]
  player.cardStates = { [CARD_ID]: { extraData: { triggerRound: 2 } } }
  session.loadState(state)
  return session
}

const acceptTelegram = (session: GameSession, response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return chooseSupplyWorkerTurn(session, CARD_ID)
}

describe('A022 Telegram parity', () => {
  it('A022 S1: one fence in supply schedules Telegram for the next round and costs two food', () => {
    const response = play(setupPurchase())

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'triggerRound')).toBe(2)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(inactiveWorkersInSupply(response.state.players[0]!)).toHaveLength(3)
  })

  it('A022 S2: no fence in supply keeps Telegram unavailable without payment', () => {
    const response = enterImprovementChoice(setupPurchase({ fencesInSupply: 0 }))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(2)
  })

  it('A022 S3: a target after round fourteen records no Telegram round', () => {
    const response = play(setupPurchase({ round: 14 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(readCardExtraData<number>(response.state.players[0]!, CARD_ID, 'triggerRound')).toBeUndefined()
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A022 S4: in the target round Telegram places a supply person without adding a family member', () => {
    const session = setupDue()
    let response = acceptTelegram(session, session.performRoundEnd())
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    expect(getChoiceOptions(response)?.map((option) => option.value)).toContain('forest')
    response = session.resolveChoice(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(2)
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(2)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: response.state.players[0]!.id, workerId: '3' }))
  })

  it('A022 S5: Telegram offers no supply placement when no person remains in supply', () => {
    const response = setupDue({ supplyFarmer: false }).performRoundEnd()

    expect(response.state.round).toBe(2)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.workers.filter((worker) => worker.isActive)).toHaveLength(5)
  })

  it('A022 permits an ordinary placement before its supply turn and expires after returning home', () => {
    const session = setupPurchase()
    expect(play(session).ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    for (const spaceId of ['forest', 'clay-pit', 'reed-bank']) {
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    expect(session.state.round).toBe(2)
    expect(takeNormalWorkerTurn(session, 'day-laborer').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    expect(session.takeAction(1, 'clay-pit').ok).toBe(true)
    expect(confirmNextPlayer(session).ok).toBe(true)
    chooseSupplyWorkerTurn(session, CARD_ID)
    const placed = session.resolveChoice(0, 'forest')
    expect(placed.ok, placed.error).toBe(true)
    expect(workersAtHome(placed.state, placed.state.players[0]!)).toHaveLength(1)
    expect(placed.state.actionSpaces.find((space) => space.id === 'forest')!.takenBy)
      .toContainEqual({ playerId: placed.state.players[0]!.id, workerId: '3' })
    expect(confirmNextPlayer(session).state.currentPlayerIndex).toBe(1)
    for (const spaceId of ['reed-bank', 'grain-seeds']) {
      expect(takeNormalWorkerTurn(session, spaceId).ok).toBe(true)
      expect(confirmNextPlayer(session).ok).toBe(true)
    }
    const returned = session.getState()
    expect(returned.state.round).toBe(3)
    expect(returned.interaction.stateId).toBe('idle')
    expect(inactiveWorkersInSupply(returned.state.players[0]!)).toHaveLength(3)
  })

})
describe("A022 command boundaries", () => {
  const CORNER = 'A026_SleepingCorner', TELEGRAM = 'A022_Telegram'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  const roomTiles = [{ row: 0, col: 0 }, { row: 1, col: 0 }, { row: 2, col: 0 }, { row: 1, col: 1 }, { row: 2, col: 1 }, { row: 0, col: 1 }]
  function setRooms(state: GameState, count: number, owner = 0) {
    state.players[owner]!.rooms = count
    state.players[owner]!.roomTiles = roomTiles.slice(0, count).map(t => ({ ...t }))
  }
  function setup(card: string, { played = true, rooms = 3, people = 2, grainFields = 2, occupations = 1, resources = {} }: {
    played?: boolean
    rooms?: number
    people?: number
    grainFields?: number
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => { }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        for (const p of state.players)
          Object.assign(p.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        setRooms(state, rooms)
        setActiveWorkerCount(p, people)
        p.minorHand = played ? ['__test_placeholder__'] : [card, '__test_placeholder__']
        p.minorPlayed = played ? [card] : []
        p.occupationPlayed = occupations ? ['D115_FodderPlanter'] : []
        Object.assign(p.resources, resources)
        if (card === CORNER)
          p.fields = Array.from({ length: grainFields }, (_, i) => ({ row: 0, col: i + 2, stacks: [{ kind: 'grain', remaining: 1 }] }))
        configure(state)
      } }))
    return s
  }
  function options(r: SessionResponse) {
    ok(r)
    assert(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function minorMenu(s: GameSession, card: string) {
    let r = ok(s.takeAction(0, 'meeting-place'))
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const branch = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (branch)
        r = ok(s.resolveChoice(0, branch.value))
    }
    return r
  }
  function denied(s: GameSession, card: string) {
    const r = minorMenu(s, card)
    assert(!r.state.players[0]!.minorPlayed.includes(card))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice')
      assert(!getChoiceOptions(r).some(o => o.value === card && !o.disabled))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
  }
  function buy(s: GameSession, card: string) {
    const r = minorMenu(s, card)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert(options(r).some(o => o.value === card && !o.disabled))
    return ok(s.resolveChoice(0, card))
  }
  function fenceLayout(state: GameState, reserve: 0 | 1) {
    const p = state.players[0]!
    const edges = new Set(['H-0-1', 'H-0-2', 'H-1-1', 'H-1-2', 'V-0-1', 'V-0-3', 'H-0-3', 'H-0-4', 'H-1-3', 'H-1-4', 'V-0-5', 'H-2-4', 'V-1-4', 'V-1-5'])
    const first = reserve === 1
      ? [{ id: 'left', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }]
      : [{ id: 'left1', tiles: [{ row: 0, col: 1 }] }, { id: 'left2', tiles: [{ row: 0, col: 2 }] }]
    if (reserve === 0)
      edges.add('V-0-2')
    p.pastures = [...first, { id: 'right', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }] }, { id: 'bottom', tiles: [{ row: 1, col: 4 }] }].map(pasture => ({ ...pasture, animalType: null, animalCount: 0 }))
    p.fenceSegments = [...edges].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    assert.equal(p.fenceSegments.length, 15 - reserve)
  }
  function telegram({ round = 1, reserve = 1, food = 20, played = false, people = 2 }: {
    round?: number
    reserve?: 0 | 1
    food?: number
    played?: boolean
    people?: number
  } = {}) {
    return setup(TELEGRAM, { played, rooms: people === 5 ? 5 : 2, people, resources: { food, wood: 1 } }, state => {
      state.round = round
      fenceLayout(state, reserve)
      const forest = state.actionSpaces.find(space => space.id === 'forest')
      assert(forest)
      forest.resources.wood = 3
      if (played)
        state.players[0]!.cardStates[TELEGRAM] = { extraData: { triggerRound: 2 } }
    })
  }
  function triggerRound(r: SessionResponse) { return r.state.players[0]!.cardStates[TELEGRAM]?.extraData?.triggerRound; }
  function normal(s: GameSession, space: string) { return confirmNext(s, ok(takeNormalWorkerTurn(s, space))); }
  function naturalDue() {
    const s = telegram()
    confirmNext(s, buy(s, TELEGRAM))
    normal(s, 'grain-seeds')
    normal(s, 'day-laborer')
    const r = normal(s, 'clay-pit')
    assert.equal(r.state.round, 2)
    assert.equal(triggerRound(r), 2)
    return s
  }
  function withoutSnapshotEpoch(r: SessionResponse): SessionResponse {
    return { ...r, state: { ...r.state, players: r.state.players.map(p => {
          const snapshot = p.cardStates.__actionSnapshot__
          if (!snapshot)
            return p
          const { token: _token, lastToken: _lastToken, ...counts } = snapshot.extraData ?? {}
          return { ...p, cardStates: { ...p.cardStates, __actionSnapshot__: { ...snapshot, extraData: counts } } }
        }) } }
  }
  it("missing fee or fence reserve rejects and exact purchase undo schedules once", () => {
    denied(telegram({ food: 1 }), TELEGRAM)
    denied(telegram({ reserve: 0 }), TELEGRAM)
    const s = telegram({ food: 2 })
    const before = undoRuleSnapshot(s.getState())
    const r = buy(s, TELEGRAM)
    assert.equal(r.state.players[0]!.resources.food, 0)
    assert.equal(triggerRound(r), 2)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, TELEGRAM))
    assertUndoRestored(before, s.undoAction())
    assert.equal(triggerRound(buy(s, TELEGRAM)), 2)
  })
  it("round fourteen is last valid target and round fifteen is never invented", () => {
    for (const [round, expected] of [[13, 14], [14, undefined]]) {
      const r = buy(telegram({ round }), TELEGRAM)
      assert.equal(triggerRound(r), expected)
      assert.equal(r.state.players[0]!.resources.food, 18)
    }
  })
  it("real due-round supply turn rejects occupied target and wrong actor before legal temporary placement", () => {
    const s = naturalDue()
    normal(s, 'day-laborer')
    normal(s, 'grain-seeds')
    const beforeState = s.getState()
    const beforeEpoch = beforeState.state.players[0]!.cardStates.__actionSnapshot__?.extraData?.token
    assert.equal(typeof beforeEpoch, 'number')
    assert(typeof beforeEpoch === 'number')
    const before = undoRuleSnapshot(withoutSnapshotEpoch(beforeState))
    const menu = ok(chooseSupplyWorkerTurn(s, TELEGRAM))
    assert(options(menu).some(o => o.value === 'forest'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'grain-seeds'))
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'forest'))
    const r = ok(s.resolveChoice(0, 'forest'))
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(inactiveWorkersInSupply(r.state.players[0]!).length, 2)
    assert.equal(r.state.players[0]!.resources.wood, 7)
    assert.equal(r.state.players[0]!.workers.filter(w => w.supplyUse?.status === 'temporary').length, 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'forest'))
    const undone = ok(s.undoAction())
    const afterEpoch = undone.state.players[0]!.cardStates.__actionSnapshot__?.extraData?.token
    assert.equal(typeof afterEpoch, 'number')
    assert(typeof afterEpoch === 'number' && afterEpoch > beforeEpoch)
    assert.equal(undone.state.players[0]!.cardStates.__actionSnapshot__?.extraData?.lastToken, afterEpoch)
    assertUndoRestored(before, withoutSnapshotEpoch(undone))
    chooseSupplyWorkerTurn(s, TELEGRAM)
    assert.equal(ok(s.resolveChoice(0, 'forest')).state.players[0]!.resources.wood, 7)
  })
  it("temporary person returns to supply after real rotation and cannot activate next round", () => {
    const s = naturalDue()
    chooseSupplyWorkerTurn(s, TELEGRAM)
    confirmNext(s, ok(s.resolveChoice(0, 'forest')))
    normal(s, 'grain-seeds')
    normal(s, 'day-laborer')
    normal(s, 'clay-pit')
    const r = normal(s, 'reed-bank')
    assert.equal(r.state.round, 3)
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(inactiveWorkersInSupply(r.state.players[0]!).length, 3)
    assert.equal(r.state.players[0]!.workers.some(w => w.supplyUse), false)
    assert.equal(r.interaction.stateId, 'idle')
    assertRejectedUnchanged(s, () => s.resolveChoice(0, TELEGRAM))
    assert.equal(familySize(ok(s.takeAction(0, 'grain-seeds')).state.players[0]!), 2)
  })
  it("no sixth component exists when all five people are active", () => {
    const s = telegram({ played: true, people: 5 })
    for (const p of s.state.players)
      markAllWorkersUsed(s.state, p)
    const r = ok(s.performRoundEnd())
    assert.equal(r.state.round, 2)
    assert.equal(r.interaction.stateId, 'idle')
    assert.equal(familySize(r.state.players[0]!), 5)
    assert.equal(inactiveWorkersInSupply(r.state.players[0]!).length, 0)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, TELEGRAM))
  })
  it("actual fence use after purchase does not retarget the fixed round", () => {
    const s = telegram({ round: 13 })
    confirmNext(s, buy(s, TELEGRAM))
    normal(s, 'grain-seeds')
    const start = ok(s.takeAction(0, 'fencing'))
    assert(start.interaction.stateId === 'wait' && start.interaction.request.kind === 'farm-select', JSON.stringify(start.interaction))
    const r = ok(s.commitSelectionChoice(0, { edges: ['V-0-2'] }))
    assert.equal(r.state.players[0]!.fenceSegments.length, 15)
    assert.equal(triggerRound(r), 14)
    assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  it("unused Telegram remains available after an ordinary placement and actual opponent turn", () => {
    const s = naturalDue()
    normal(s, 'day-laborer')
    normal(s, 'grain-seeds')
    const menu = ok(chooseSupplyWorkerTurn(s, TELEGRAM))
    assert(options(menu).some(o => o.value === 'forest'))
    const r = ok(s.resolveChoice(0, 'forest'))
    assert.equal(r.state.players[0]!.resources.wood, 7)
    assert.equal(familySize(r.state.players[0]!), 2)
    assert.equal(inactiveWorkersInSupply(r.state.players[0]!).length, 2)
    assert.equal(r.state.players[0]!.workers.filter(w => w.supplyUse?.status === 'temporary').length, 1)
  })
})
