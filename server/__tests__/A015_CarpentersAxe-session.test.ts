import { expectWait } from './_helpers/trigger-select'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/A/A015_CarpentersAxe'
import assert from 'node:assert/strict'
import { type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions, expectTileFarmSelection } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A015_CarpentersAxe'
const FILLER = '__test_placeholder__'

const setup = ({ wood = 4, forestWood = 3 } = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7015, options: { playerCount: 2 } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorPlayed = [CARD_ID]
  owner.resources.wood = wood
  const forest = state.actionSpaces.find((space) => space.id === 'forest')!
  forest.resources.wood = forestWood
  session.loadState(state)
  return session
}

const expectStableChoice = (response: SessionResponse) => {
  expect(response.interaction).toMatchObject({
    stateId: 'wait',
    request: { kind: 'farm-select', farm: { farmType: 'stable', maxSelections: 1 } },
  })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') {
    throw new Error('expected Carpenter Axe stable selection')
  }
  return expectTileFarmSelection(response, 'stable').selectableTiles[0]!
}

const acceptCarpentersAxe = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value !== '__skip__')
  expect(option).toBeDefined()
  return session.resolveChoice(expectWait(response).interaction.playerIndex, option!.value)
}

describe("A015 Carpenter's Axe parity", () => {
  it('A015 S1: reaching seven wood from Forest may build exactly one stable for one wood', () => {
    const session = setup()
    let response = acceptCarpentersAxe(session, session.takeAction(0, 'forest'))
    const target = expectStableChoice(response)

    response = session.commitSelectionChoice(0, { stables: [target] })

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.state.players[0]!.stableTiles).toEqual([target])
  })

  it('A015 S2: the Carpenter Axe stable may be declined without paying wood', () => {
    const session = setup()
    const pending = session.takeAction(0, 'forest')
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })

    const response = session.resolveChoice(0, '__skip__')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })

  it('A015 S3: ending below seven wood offers no Carpenter Axe stable', () => {
    const response = setup({ wood: 3 }).takeAction(0, 'forest')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(6)
    expect(response.interaction).not.toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })

  it('A015 S4: non-wood accumulation spaces do not trigger Carpenter Axe', () => {
    const session = setup({ wood: 7 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'clay-pit')!.resources.clay = 3
    session.loadState(state)

    const response = session.takeAction(0, 'clay-pit')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.wood).toBe(7)
    expect(response.interaction).not.toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'stable' } },
    })
    expect(response.state.players[0]!.stableTiles).toEqual([])
  })
})
describe("A015 command boundaries", () => {
  const A013 = 'A013_RenovationCompany'
  const A015 = 'A015_CarpentersAxe'
  const pair = [{ row: 1, col: 1 }, { row: 2, col: 1 }]
  function setup({ card = A013, played = false, house = 'wood', rooms = 2, stableCount = 0, resources = {}, opponent = {} }: {
    card?: string
    played?: boolean
    house?: PlayerState['houseType']
    rooms?: number
    stableCount?: number
    resources?: Partial<PlayerState['resources']>
    opponent?: Partial<PlayerState['resources']>
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 514, configure: state => {
        state.round = 14
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 40, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : [card]
        p.minorPlayed = played ? [card] : []
        p.houseType = house
        p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...pair.slice(0, rooms - 2)]
        p.rooms = rooms
        p.stableTiles = Array.from({ length: stableCount }, (_, col) => ({ row: 0, col: col + 1 }))
        Object.assign(p.resources, resources)
        Object.assign(state.players[1]!.resources, opponent)
        const forest = state.actionSpaces.find(a => a.id === 'forest')!
        forest.resources.wood = 3
      } }))
    assert.equal(s.getState().state.players[0]!.rooms, rooms)
    return s
  }
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function opts(r: SessionResponse) { return r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' ? getChoiceOptions(r) : []; }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const o = opts(r).find(predicate)
    assert.ok(o, JSON.stringify(r.interaction))
    return ok(s.resolveChoice(expectWait(r).interaction.playerIndex, o.value))
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function minor(s: GameSession, card: string) {
    let r = turn(s, 0, 'meeting-place')
    if (!opts(r).some(o => o.value === card) && opts(r).some(o => o.value.startsWith('action-improvement-') && !o.value.includes('skip')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-') && !o.value.includes('skip'))
    return r
  }
  function buy(s: GameSession, card: string) { const r = minor(s, card); return r.state.players[0]!.minorPlayed.includes(card) ? r : choose(s, r, o => o.value === card); }
  function deniedCard(s: GameSession, card: string) {
    const r = minor(s, card)
    assert.equal(opts(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    assert.ok(s.getState().state.players[0]!.minorHand.includes(card))
  }
  function axe(s: GameSession) { const r = turn(s, 0, 'forest'); return choose(s, r, o => o.value !== '__skip__'); }
  it("zero wood forged purchase rejects and exact one wood buys axe", () => {
    deniedCard(setup({ card: A015 }), A015)
    const s = setup({ card: A015, resources: { wood: 1 } })
    const r = buy(s, A015)
    assert.ok(r.state.players[0]!.minorPlayed.includes(A015))
    assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  it("post-collection six skips while seven and eight allow one paid stable", () => {
    const six = setup({ card: A015, played: true, resources: { wood: 3 } })
    const no = turn(six, 0, 'forest')
    assert.equal(no.state.players[0]!.resources.wood, 6)
    assert.equal(no.state.players[0]!.stableTiles.length, 0)
    assert.ok(no.interaction.stateId === 'wait' && no.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(six, () => six.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    for (const initial of [4, 5]) {
      const s = setup({ card: A015, played: true, resources: { wood: initial } })
      axe(s)
      const r = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
      assert.equal(r.state.players[0]!.resources.wood, initial + 2)
      assert.equal(r.state.players[0]!.stableTiles.length, 1)
    }
  })
  it("two duplicate occupied and off-board stable targets reject before legal retry", () => {
    const s = setup({ card: A015, played: true, resources: { wood: 4 } })
    const r = axe(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'stable')
    assert.equal(r.interaction.request.farm.maxSelections, 1)
    for (const stables of [[{ row: 0, col: 1 }, { row: 0, col: 2 }], [{ row: 0, col: 1 }, { row: 0, col: 1 }], [{ row: 1, col: 0 }], [{ row: 9, col: 9 }]])
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(1, { stables: [{ row: 0, col: 1 }] }))
    const done = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    assert.equal(done.state.players[0]!.resources.wood, 6)
    assert.equal(done.state.players[0]!.stableTiles.length, 1)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 2 }] }))
  })
  it("four real stables leave no piece or legal fifth build", () => {
    const s = setup({ card: A015, played: true, stableCount: 4, resources: { wood: 4 } })
    const r = turn(s, 0, 'forest')
    assert.equal(r.state.players[0]!.resources.wood, 7)
    assert.equal(r.state.players[0]!.stableTiles.length, 4)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 1, col: 1 }] }))
  })
  it("nonwood owner action and opponent wood collection do not trigger", () => {
    const s = setup({ card: A015, played: true, resources: { wood: 7 }, opponent: { wood: 4 } })
    turn(s, 0, 'clay-pit')
    const r = turn(s, 1, 'forest')
    assert.equal(r.state.players[0]!.resources.wood, 7)
    assert.equal(r.state.players[1]!.resources.wood, 7)
    assert.equal(r.state.players[0]!.stableTiles.length, 0)
    assert.equal(r.state.players[1]!.stableTiles.length, 0)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
  })
  it("decline stale requests and action undo preserve one-stable allowance", () => {
    const s = setup({ card: A015, played: true, resources: { wood: 4 } })
    const before = undoRuleSnapshot(s.getState())
    turn(s, 0, 'forest')
    ok(s.resolveChoice(0, '__skip__'))
    assert.equal(s.getState().state.players[0]!.resources.wood, 7)
    assert.equal(s.getState().state.players[0]!.stableTiles.length, 0)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    assertUndoRestored(before, s.undoAction())
    axe(s)
    const r = ok(s.commitSelectionChoice(0, { stables: [{ row: 0, col: 1 }] }))
    assert.equal(r.state.players[0]!.resources.wood, 6)
    assert.equal(r.state.players[0]!.stableTiles.length, 1)
    assert.equal(r.scores?.length, 2)
    assert.ok(r.state.log.length > 0)
  })
})
