import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/E/E016_BriarHedge'
import { E016_BriarHedge } from '../../shared/cards/E/E016_BriarHedge'
import '../../shared/cards/B/B030_WoodPalisades'
import assert from 'node:assert/strict'
import { positionKey } from '../../shared/domain/farm'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit31Plows from './_helpers/audit/ae-negative-31-plows'

describe('E016_BriarHedge session', () => {
  const setup = () => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('blocked without any animals', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(session.withCtx(() => meetsCardPrerequisites(player, E016_BriarHedge, state.round, state))).toBe(false)
  })

  it('blocked with only sheep + pig (missing cattle)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: 'sheep', animalCount: 1 },
      { id: 'p2', size: 1, stables: 0, tiles: [{ row: 0, col: 1 }], animalType: 'boar', animalCount: 1 },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E016_BriarHedge, state.round, state))).toBe(false)
  })

  it('playable with 1 of each animal type on the board', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: 'sheep', animalCount: 1 },
      { id: 'p2', size: 1, stables: 0, tiles: [{ row: 0, col: 1 }], animalType: 'boar', animalCount: 1 },
      { id: 'p3', size: 1, stables: 0, tiles: [{ row: 0, col: 2 }], animalType: 'cattle', animalCount: 1 },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E016_BriarHedge, state.round, state))).toBe(true)
  })

  it('animals in house and stables count', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    player.stableAnimals = { '0-0': { animalType: 'boar', animalCount: 1 } }
    player.pastures = [
      { id: 'p3', size: 1, stables: 0, tiles: [{ row: 1, col: 0 }], animalType: 'cattle', animalCount: 1 },
    ]
    expect(session.withCtx(() => meetsCardPrerequisites(player, E016_BriarHedge, state.round, state))).toBe(true)
  })

  it('animals held on animal-holder cards count', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    player.stableAnimals = { '0-0': { animalType: 'boar', animalCount: 1 } }
    player.cardStates = {
      Test_AnimalHolder: {
        extraData: { held: 1, animalType: 'cattle' },
      },
    }
    expect(session.withCtx(() => meetsCardPrerequisites(player, E016_BriarHedge, state.round, state))).toBe(true)
  })
})

describe('E16 BriarHedge — border-fence discount', () => {
  const discountSetup = (opts: { withCard?: boolean; wood: number; withB30?: boolean }) => {
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.resources = { ...player.resources, wood: opts.wood }
    if (opts.withCard !== false) player.minorPlayed.push('E016_BriarHedge')
    if (opts.withB30) player.minorPlayed.push('B030_WoodPalisades')
    session.loadState(state)
    return session
  }

  it('D.1 tile(0,0) 四边：2 border 免 + 2 内部付 2 wood', () => {
    // Give 4 wood so canStartFencing passes; E16 frees 2 border edges → pay 2 → leftover 2
    const session = discountSetup({ wood: 4 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(2) // paid 2 (2 internal), 2 border free
    expect(getFenceCount(p)).toBe(4)
    expect(p.pastures).toHaveLength(1)
    expect(readCardResourceStats(p, 'E016_BriarHedge')?.saved).toEqual({ wood: 2 })
  })

  it('D.2 未打 E16 同布局无折扣：border 边全额付费', () => {
    // Without E16: same tile(0,0) layout costs 4 wood (no discount); give exactly 4
    // → should succeed and spend all 4 wood (nothing left)
    const session = discountSetup({ wood: 4, withCard: false })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(0) // no discount → paid all 4
    expect(getFenceCount(p)).toBe(4)
  })

  it('D.3 全内部围栏不享受折扣', () => {
    const session = discountSetup({ wood: 4 })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    // Enclose tile(1,1) center: all 4 edges are internal
    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-1', 'H-2-1', 'V-1-1', 'V-1-2'],
      palisadeEdges: [],
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(0)
    expect(getFenceCount(p)).toBe(4)
    expect(readCardResourceStats(p, 'E016_BriarHedge')).toBeUndefined()
  })

  it('D.4 E16 + B30 共存：border 给 palisade 不给 E16 额外免', () => {
    const session = discountSetup({ wood: 6, withB30: true })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],         // 2 internal fences
      palisadeEdges: ['H-0-0', 'V-0-0'], // 2 border palisades
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(0) // 2×1 + 2×2 = 6
    expect(getFenceCount(p)).toBe(2)
    expect(getPalisadeCount(p)).toBe(2)
  })

  it('D.5 E16 + B30 混合：border fence 享受折扣', () => {
    const session = discountSetup({ wood: 5, withB30: true })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    // tile(0,0): top fence (border, free) + 2 internal fences + 1 border palisade
    resp = session.commitSelectionChoice(0, {
      edges: ['H-0-0', 'H-1-0', 'V-0-1'], // 3 fences (1 border + 2 internal)
      palisadeEdges: ['V-0-0'],           // 1 border palisade
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    // 3 fences - 1 E16 free = 2 payable × 1 wood = 2; 1 palisade × 2 = 2; initial 5 - 4 = 1
    expect(p.resources.wood).toBe(1)
    expect(getFenceCount(p)).toBe(3)
    expect(getPalisadeCount(p)).toBe(1)
  })
})

describe('ae-negative-31-plows', () => {
  const { sessions, options, actor, save, setup, choose, take, hand, buy, boundary, fence } = audit31Plows
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('E016 N1 real animal prerequisite accepts all three assigned species and rejects missing cattle', () => {
    for (const all of [true, false]) {
      const card = 'E016_BriarHedge', s = setup(card, 14, st => { hand(st, card); const p = st.players[0]!; p.stableTiles = [{ row: 0, col: 2 }, { row: 0, col: 3 }, { row: 0, col: 4 }]; p.stableAnimals = { [positionKey({ row: 0, col: 2 })]: { animalType: 'sheep', animalCount: 1 }, [positionKey({ row: 0, col: 3 })]: { animalType: 'boar', animalCount: 1 }, ...(all ? { [positionKey({ row: 0, col: 4 })]: { animalType: 'cattle' as const, animalCount: 1 } } : {}) }; Object.assign(p.resources, { sheep: 1, boar: 1, cattle: all ? 1 : 0 }); })
      if (all) {
        const r = buy(s, card)
        assert.ok(r.state.players[0]!.minorPlayed.includes(card))
        save('E016-N1-legal', r)
      }
      else {
        let r = take(s, 'meeting-place')
        if (options(r).some(o => o.value.startsWith('action-improvement-')))
          r = choose(s, r, o => o.value.startsWith('action-improvement-'))
        assert.ok(!options(r).some(o => o.value === card && !o.disabled))
        assertRejectedUnchanged(s, () => s.resolveChoice(actor(r), card))
        assert.ok(r.state.players[0]!.minorHand.includes(card))
        save('E016-N1-missing', r)
      }
    }
  })
  it('E016 N2 border fences discount only board edges while interior and hand-only fences pay full', () => {
    for (const mode of ['border', 'interior', 'hand']) {
      const card = 'E016_BriarHedge', wood = mode === 'border' ? 2 : 4, s = setup(card, 14, st => {
        st.players[0]!.resources.wood = wood
        if (mode === 'hand')
          hand(st, card)
      })
      const tiles = mode === 'interior' ? [{ row: 1, col: 2 }] : [{ row: 2, col: 4 }]
      const r = fence(s, take(s, 'fencing'), boundary(tiles))
      assert.equal(r.state.players[0]!.resources.wood, 0)
      assert.equal(r.state.players[0]!.fenceSegments.length, 4)
      assert.equal(r.state.players[0]!.pastures.length, 1)
      save(`E016-N2-${mode}`, r)
    }
  })
  it('E016 N3 one wood cannot pay two internal edges and finite original fences remain unchanged', () => { const card = 'E016_BriarHedge', s = setup(card, 14, st => st.players[0]!.resources.wood = 1); const r = take(s, 'fencing'); assertRejectedUnchanged(s, () => s.commitSelectionChoice(actor(r), { edges: boundary([{ row: 2, col: 4 }]), palisadeEdges: [] })); assert.equal(s.state.players[0]!.resources.wood, 1); assert.equal(s.state.players[0]!.fenceSegments.length, 0); save('E016-N3', s.getState()); })
})
