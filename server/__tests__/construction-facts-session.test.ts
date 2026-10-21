import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { setActiveWorkerCount, familySize } from '../../shared/domain/player'
import { readTurnScopeToken } from '../../shared/cards/helpers/turn-token'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { countDistinctStablesBuiltThisTurn } from '../../shared/cards/helpers/action-snapshot'

const CLEANER = 'C094_StableCleaner'
const SAW = 'E014_WoodSaw'
const MANURE = 'A043_FarmyardManure'
const TREE = 'A074_StableTree'
const BREEDER = 'A167_BreederBuyer'
const MILKER = 'D166_StableMilker'
const SHED = 'E114_ShedBuilder'
const RUSTIC = 'B111_Rustic'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(played: string[], target?: string, configure?: (state: GameState) => void, moor = false) {
  const session = createWorkSession({ seed: 4242, options: { enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = 5
    state.actionSpaces.forEach(space => { space.takenBy = [] })
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.stableTiles = []
      player.houseAnimals = {}
      player.stableAnimals = {}
      player.pastures = []
      Object.assign(player.resources, { food: 30, wood: 30, clay: 30, stone: 10, reed: 20,
        grain: 0, vegetable: 0, cattle: 0, boar: 0, sheep: 0 })
    }
    const p = state.players[0]!
    p.minorPlayed = played.filter(id => [SAW, MANURE, TREE, 'C056_FeedFence'].includes(id))
    p.occupationPlayed = played.filter(id => !p.minorPlayed.includes(id))
    if (played.includes(SAW)) {
      setActiveWorkerCount(state.players[1]!, 3)
      state.players[1]!.rooms = 3
      state.players[1]!.roomTiles.push({ row: 1, col: 1 })
    }
    if (target) {
      if ([MANURE, TREE].includes(target)) p.minorHand = [target, 'A006_StorageBarn']
      else p.occupationHand = [target, RUSTIC]
    }
    if (target === MANURE || played.includes(MANURE)) {
      p.houseAnimals = { '1-0': 'sheep' }
      p.resources.sheep = 1
    }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function ok(r: SessionResponse): SessionResponse {
  assert.equal(r.ok, true, `${r.error}: ${JSON.stringify(r.interaction)}`)
  return r
}
function choose(session: GameSession, r: SessionResponse, wanted?: string) {
  assert.ok(r.interaction.stateId === 'wait')
  const options = r.interaction.request.options ?? []
  const option = wanted ? options.find(o => o.value === wanted || o.labelKey === wanted)
    : options.find(o => !o.disabled && !['__skip__', '__done__', '__pass__'].includes(o.value))
  assert.ok(option, JSON.stringify(r.interaction))
  return ok(session.resolveChoice(r.interaction.playerIndex, option.value))
}
function anytime(session: GameSession, id = 'C94-stable-cleaner-anytime') {
  assert.ok(session.getState().interaction.anytimeActions.some(a => a.id === id))
  let r = ok(session.takeAnytimeAction(0, id))
  for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice'; n++) r = choose(session, r)
  return r
}
function build(session: GameSession, r: SessionResponse, kind: 'room' | 'stable', count = 1) {
  assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select', JSON.stringify(r.interaction))
  assert.equal(r.interaction.request.farm.farmType, kind)
  const player = r.state.players[r.interaction.playerIndex]!
  const occupied = [...player.roomTiles, ...player.stableTiles]
  const tiles = r.interaction.request.farm.selectableTiles.filter(t => !occupied.some(o => o.row === t.row && o.col === t.col)
    && (kind !== 'room' || player.roomTiles.some(o => Math.abs(o.row - t.row) + Math.abs(o.col - t.col) === 1))).slice(0, count)
  assert.equal(tiles.length, count)
  return ok(session.commitSelectionChoice(r.interaction.playerIndex, kind === 'room' ? { rooms: tiles } : { stables: tiles }))
}
function menu(session: GameSession, target: string) {
  let r = ok(session.takeAction(0, [MANURE, TREE].includes(target) ? 'meeting-place' : 'lessons'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
    const branch = r.interaction.request.options.find(o => o.value.startsWith('action-improvement-'))
    if (branch) r = choose(session, r, branch.value)
  }
  return r
}
function settleAnimals(session: GameSession, initial: SessionResponse) {
  let r = initial
  for (let n = 0; n < 4 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg'; n++) {
    r = ok(session.resolveChoice(r.interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones }))
  }
  return r
}
function expansion(session: GameSession, kind: 'room' | 'stable') {
  let r = ok(session.takeAction(0, 'farm-expansion'))
  if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') r = choose(session, r, kind === 'room' ? 'actions.construct.name' : 'actions.stables.name')
  return r
}

describe('host construction receipts, #1316', () => {
  it.each([false, true])('Shed Builder counts each host once, with enclosing Turn=%s', inTurn => {
    const session = setup([CLEANER, SHED])
    if (inTurn) expansion(session, 'stable')
    const first = build(session, anytime(session), 'stable')
    expect(first.state.players[0]!.resources.grain).toBe(1)
    expect(readTurnScopeToken(first.state.players[0]!)).toEqual(inTurn ? 1 : undefined)
    if (inTurn) {
      const second = build(session, first, 'stable')
      expect(second.state.players[0]!.resources.grain).toBe(2)
      expect(second.state.players[0]!.stableTiles).toHaveLength(2)
      expect(second.state.events.filter(e => e.type === 'farm.stableBuilt')).toHaveLength(2)
    }
  })

  it.each([false, true])('Rustic counts each clay construct once, with enclosing Turn=%s', inTurn => {
    const session = setup([SAW, RUSTIC], undefined, state => { state.players[0]!.houseType = 'clay' })
    if (inTurn) expansion(session, 'room')
    let r = build(session, anytime(session, 'E14-wood-saw-anytime'), 'room')
    expect(r.state.players[0]!.resources.food).toBe(32)
    expect(r.state.players[0]!.cardStates[RUSTIC]?.counters?.bonusVp).toBe(1)
    if (inTurn) {
      r = build(session, r, 'room')
      expect(r.state.players[0]!.resources.food).toBe(34)
      expect(r.state.players[0]!.cardStates[RUSTIC]?.counters?.bonusVp).toBe(2)
      expect(r.state.events.filter(e => e.type === 'farm.roomBuilt')).toHaveLength(2)
    }
  })

  it('A021 uses the current construct baseline after an intervening E014 room', () => {
    const session = setup([SAW], undefined, state => { state.players[0]!.minorPlayed.push('A021_FamilyFriendHome') })
    expansion(session, 'room')
    const first = build(session, anytime(session, 'E14-wood-saw-anytime'), 'room')
    expect(first.state.players[0]!.resources.food).toBe(30)
    expect(familySize(first.state.players[0]!)).toBe(2)
    const second = build(session, first, 'room')
    expect(second.state.players[0]!.resources.food).toBe(31)
    expect(second.state.players[0]!.roomTiles).toHaveLength(4)
    expect(familySize(second.state.players[0]!)).toBe(3)
  })

  it("D128 creates its own builder receipt for the reacting player's Rustic", () => {
    const session = setup([], undefined, state => {
      state.players[1]!.occupationPlayed = ['D128_BuildingTycoon', RUSTIC]
      state.players[1]!.houseType = 'clay'
    })
    let r = build(session, expansion(session, 'room'), 'room')
    for (let n = 0; n < 8 && !(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select'); n++) {
      assert.ok(r.interaction.stateId === 'wait')
      r = r.interaction.request.kind === 'confirm-player-switch'
        ? ok(session.resolveChoice(r.interaction.playerIndex, 'confirm')) : choose(session, r)
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    expect(r.interaction.playerIndex).toBe(1)
    r = build(session, r, 'room')
    expect(r.state.players[1]!.roomTiles).toHaveLength(3)
    expect(r.state.players[1]!.resources.food).toBe(31)
    expect(r.state.players[1]!.cardStates[RUSTIC]?.counters?.bonusVp).toBe(1)
    expect(r.state.players[0]!.resources.food).toBe(31)
  })

  it.each([false, true])('M037 applies to one construct with two rooms, split=%s', split => {
    const card = 'M037_BuildingPlan'
    const session = setup([SAW], undefined, state => {
      for (const p of state.players) p.farmTerrain = []
      state.players[0]!.minorPlayed.push(card)
    }, true)
    let r = expansion(session, 'room')
    if (split) r = build(session, anytime(session, 'E14-wood-saw-anytime'), 'room')
    r = build(session, r, 'room', split ? 1 : 2)
    if (split) {
      expect(r.interaction.stateId === 'wait' && r.interaction.sourceCard).not.toBe(card)
      expect(r.state.players[0]!.stableTiles).toHaveLength(0)
    } else {
      assert.ok(r.interaction.stateId === 'wait')
      expect(r.interaction.sourceCard).toBe(card)
      if (r.interaction.request.kind === 'choice') r = choose(session, r)
      const wood = r.state.players[0]!.resources.wood
      r = build(session, r, 'stable', 2)
      expect(r.state.players[0]!.stableTiles).toHaveLength(2)
      expect(r.state.players[0]!.resources.wood).toBe(wood)
    }
    expect(r.state.players[0]!.roomTiles).toHaveLength(4)
  })

  it('restores an enclosing host without inheriting the nested construction receipt', () => {
    const original = setup([CLEANER, SHED])
    expansion(original, 'stable')
    const first = build(original, anytime(original), 'stable')
    expect(first.state.players[0]!.resources.grain).toBe(1)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(original.state, original)))))
    sessions.push(restored)
    const r = build(restored, restored.getState(), 'stable')
    expect(r.state.players[0]!.resources.grain).toBe(2)
    expect(r.state.players[0]!.stableTiles).toHaveLength(2)
    expect(countDistinctStablesBuiltThisTurn(r.state.players[0]!)).toBe(2)
  })

  it.each(['A178_CarpentersBoy', 'E049_Twibil'])('keeps opponent builder and %s owner separate', card => {
    const session = setup([SAW], undefined, state => {
      const p = state.players[1]!
      p.resources.wood = 0
      if (card.startsWith('A178')) p.occupationPlayed = [card]
      else p.minorPlayed = [card]
    })
    expansion(session, 'room')
    let r = build(session, anytime(session, 'E14-wood-saw-anytime'), 'room')
    // Cross-player automatic reactions may ask the owner to acknowledge the switch.
    for (let n = 0; n < 5 && r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-player-switch'; n++) r = ok(session.resolveChoice(r.interaction.playerIndex, 'confirm'))
    const owner = r.state.players[1]!
    expect(card.startsWith('A178') ? owner.resources.wood : owner.resources.food).toBe(card.startsWith('A178') ? 1 : 31)
  })
})

describe('same-Turn onBuy and listener share pure rewards, #1341', () => {
  it.each([MANURE, TREE, BREEDER, MILKER])('%s recognizes a real earlier build only in the current Turn', target => {
    for (const prior of [false, true]) {
      const session = setup(target === BREEDER ? [CLEANER, SAW] : [CLEANER], target)
      let r = menu(session, target)
      if (prior) {
        r = build(session, anytime(session), 'stable', target === MILKER ? 2 : 1)
        if (target === BREEDER) r = build(session, anytime(session, 'E14-wood-saw-anytime'), 'room')
      }
      const before = JSON.stringify(session.state)
      session.getState()
      session.getState()
      expect(JSON.stringify(session.state)).toBe(before)
      r = settleAnimals(session, choose(session, r, target))
      const p = r.state.players[0]!
      expect([...p.minorPlayed, ...p.occupationPlayed]).toContain(target)
      expect(typeof p.cardStates[target]?.extraData?.usedTurnToken).toBe(prior ? 'number' : 'undefined')
      if (target === MILKER) expect(p.resources.cattle).toBe(prior ? 1 : 0)
      if (target === BREEDER) expect(p.resources.sheep).toBe(prior ? 1 : 0)
      if ([MANURE, TREE].includes(target)) {
        expect(r.state.futureMeeples.filter(f => f.cardId === target).map(f => ({ round: f.round, resources: f.resources })))
          .toEqual(prior ? [6, 7, 8].map(round => ({ round, resources: target === MANURE ? { food: 1 } : { wood: 1 } })) : [])
      }
      expect(r.interaction.stateId === 'wait' && r.interaction.request.kind).toBe('confirm-next-player')
    }
  })

  it('A043 accepts C094 during a Turn, once regardless of stable quantity; outside Turn gives no schedule', () => {
    const outside = setup([CLEANER, MANURE])
    expect(build(outside, anytime(outside), 'stable').state.futureMeeples).toHaveLength(0)
    const session = setup([CLEANER, MANURE])
    ok(session.takeAction(0, 'farmland'))
    let r = build(session, anytime(session), 'stable')
    expect(r.state.futureMeeples.filter(f => f.cardId === MANURE)).toHaveLength(3)
    r = build(session, anytime(session), 'stable', 2)
    expect(r.state.futureMeeples.filter(f => f.cardId === MANURE)).toHaveLength(3)
    expect(r.state.players[0]!.stableTiles).toHaveLength(3)
  })

  it.each([false, true])('D166 distinguishes reused and distinct returned tokens, return old=%s', returnOld => {
    const oldTile = { row: 2, col: 4 }
    const session = setup([CLEANER, 'C096_Merchant', MILKER], undefined, state => {
      const p = state.players[0]!
      p.stableTiles = returnOld ? [oldTile] : []
      p.minorHand = ['E076_LumberPile', 'A006_StorageBarn']
    })
    menu(session, MANURE)
    let r = build(session, anytime(session), 'stable')
    const first = r.state.players[0]!.stableTiles.find(t => t.row !== oldTile.row || t.col !== oldTile.col)!
    r = choose(session, r, 'E076_LumberPile')
    for (let n = 0; n < 10 && !(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection'); n++) r = choose(session, r)
    r = ok(session.commitSelectionChoice(0, { positions: [returnOld ? oldTile : first] }))
    r = settleAnimals(session, build(session, anytime(session), 'stable'))
    expect(countDistinctStablesBuiltThisTurn(r.state.players[0]!)).toBe(returnOld ? 2 : 1)
    expect(r.state.players[0]!.resources.cattle).toBe(returnOld ? 1 : 0)
  })

  it.each([false, true])('A167 rewards the room actually built before Trowel renovation, onBuy=%s', onBuy => {
    const session = setup([CLEANER, SAW, ...(onBuy ? [] : [BREEDER])], onBuy ? BREEDER : undefined, state => {
      state.players[0]!.minorPlayed.push('D013_Trowel')
    })
    if (onBuy) menu(session, BREEDER)
    else ok(session.takeAction(0, 'farmland'))
    build(session, anytime(session, 'E14-wood-saw-anytime'), 'room')
    const renovated = ok(session.takeAnytimeAction(0, 'D13-trowel-anytime'))
    expect(renovated.state.players[0]!.houseType).toBe('stone')
    let r = build(session, anytime(session), 'stable')
    if (onBuy) r = choose(session, r, BREEDER)
    r = settleAnimals(session, r)
    expect(r.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0, cattle: 0 })
  })

  it.each(['C056_FeedFence', 'D168_Stockman', SHED])('%s counts ordinary and Farm Hand stables in the same batch', card => {
    const session = setup([card, 'B085_FarmHand'], undefined, state => {
      const p = state.players[0]!
      p.resources.clay = 0
      p.fields = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 1, col: 2 }, { row: 1, col: 3 }].map(tile => ({ ...tile, stacks: [] }))
      p.stableTiles = [{ row: 0, col: 4 }, { row: 1, col: 4 }]
    })
    expansion(session, 'stable')
    const r = settleAnimals(session, ok(session.commitSelectionChoice(0, { stables: [{ row: 2, col: 4 }], farmHand: { row: 0, col: 2 } })))
    expect(r.state.players[0]!.resources.wood).toBe(26)
    expect(r.state.players[0]!.stableTiles).toHaveLength(3)
    expect(r.state.players[0]!.cardStates.B085_FarmHand?.extraData?.position).toEqual({ row: 0, col: 2 })
    if (card === 'C056_FeedFence') expect(r.state.players[0]!.resources.food).toBe(34)
    if (card === 'D168_Stockman') expect(r.state.players[0]!.resources).toMatchObject({ boar: 1, sheep: 1, cattle: 0 })
    if (card === SHED) expect(r.state.players[0]!.resources).toMatchObject({ grain: 0, vegetable: 2 })
    expect(r.state.events.filter(e => e.type === 'farm.stableBuilt').flatMap(e => e.stables)).toHaveLength(2)
  })

  it.each([[MANURE, TREE], [TREE, MANURE]])('resolves both captured rewards in either order: %s first', (first, second) => {
    const session = setup([CLEANER, MANURE, TREE])
    ok(session.takeAction(0, 'farmland'))
    let r = build(session, anytime(session), 'stable')
    for (const card of [first, second]) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'select-trigger', JSON.stringify(r.interaction))
      const option = r.interaction.request.options.find(o => o.sourceCard === card)
      assert.ok(option)
      r = choose(session, r, option.value)
    }
    expect(r.state.futureMeeples.filter(f => f.cardId === MANURE)).toHaveLength(3)
    expect(r.state.futureMeeples.filter(f => f.cardId === TREE)).toHaveLength(3)
    expect(r.state.players[0]!.cardStates[MANURE]?.extraData?.usedTurnToken).toBe(1)
    expect(r.state.players[0]!.cardStates[TREE]?.extraData?.usedTurnToken).toBe(1)
  })

  it('whole-action undo and retry restore construction identities, facts, payments and delayed rewards', () => {
    const session = setup([CLEANER], TREE)
    menu(session, TREE)
    let r = build(session, anytime(session), 'stable')
    r = choose(session, r, TREE)
    expect(r.state.futureMeeples.filter(f => f.cardId === TREE)).toHaveLength(3)
    const undo = ok(session.undoAction())
    expect(undo.state.players[0]!.stableTiles).toHaveLength(0)
    expect(undo.state.players[0]!.stablePieceIds).toBeUndefined()
    expect(undo.state.players[0]!.turnConstruction).toBeUndefined()
    expect(undo.state.players[0]!.minorHand).toContain(TREE)
    expect(undo.state.players[0]!.resources.wood).toBe(30)
    expect(undo.state.futureMeeples).toHaveLength(0)
    menu(session, TREE)
    r = build(session, anytime(session), 'stable')
    r = choose(session, r, TREE)
    expect(r.state.futureMeeples.filter(f => f.cardId === TREE)).toHaveLength(3)
  })
})
