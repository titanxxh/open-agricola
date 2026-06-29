import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { getFenceCount, getPalisadeCount } from '../../shared/actions/effects/fencing'

import '../../shared/cards/E/E016_BriarHedge'
import { E016_BriarHedge } from '../../shared/cards/E/E016_BriarHedge'
import '../../shared/cards/B/B030_WoodPalisades'

describe('E016_BriarHedge session', () => {
  const setup = () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    return session
  }

  it('blocked without any animals', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    expect(meetsCardPrerequisites(player, E016_BriarHedge, state.round, state)).toBe(false)
  })

  it('blocked with only sheep + pig (missing cattle)', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.pastures = [
      { id: 'p1', size: 1, stables: 0, tiles: [{ row: 0, col: 0 }], animalType: 'sheep', animalCount: 1 },
      { id: 'p2', size: 1, stables: 0, tiles: [{ row: 0, col: 1 }], animalType: 'boar', animalCount: 1 },
    ]
    expect(meetsCardPrerequisites(player, E016_BriarHedge, state.round, state)).toBe(false)
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
    expect(meetsCardPrerequisites(player, E016_BriarHedge, state.round, state)).toBe(true)
  })

  it('animals in house and stables count', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.stableAnimals = { '0-0': 'boar' }
    player.pastures = [
      { id: 'p3', size: 1, stables: 0, tiles: [{ row: 1, col: 0 }], animalType: 'cattle', animalCount: 1 },
    ]
    expect(meetsCardPrerequisites(player, E016_BriarHedge, state.round, state)).toBe(true)
  })

  it('animals held on animal-holder cards count', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!
    player.houseAnimalType = 'sheep'
    player.houseAnimalCount = 1
    player.stableAnimals = { '0-0': 'boar' }
    player.cardStates = {
      Test_AnimalHolder: {
        extraData: { held: 1, animalType: 'cattle' },
      },
    }
    expect(meetsCardPrerequisites(player, E016_BriarHedge, state.round, state)).toBe(true)
  })
})

describe('E16 BriarHedge — border-fence discount', () => {
  const discountSetup = (opts: { withCard?: boolean; wood: number; withB30?: boolean }) => {
    const session = new GameSession()
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
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(2) // paid 2 (2 internal), 2 border free
    expect(getFenceCount(p)).toBe(4)
    expect(p.pastures).toHaveLength(1)
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
      extraWood: 0,
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
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    expect(p.resources.wood).toBe(0)
    expect(getFenceCount(p)).toBe(4)
  })

  it('D.4 E16 + B30 共存：border 给 palisade 不给 E16 额外免', () => {
    const session = discountSetup({ wood: 6, withB30: true })
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, {
      edges: ['H-1-0', 'V-0-1'],         // 2 internal fences
      palisadeEdges: ['H-0-0', 'V-0-0'], // 2 border palisades
      extraWood: 0,
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
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
    const p = resp.state.players[0]!
    // 3 fences - 1 E16 free = 2 payable × 1 wood = 2; 1 palisade × 2 = 2; initial 5 - 4 = 1
    expect(p.resources.wood).toBe(1)
    expect(getFenceCount(p)).toBe(3)
    expect(getPalisadeCount(p)).toBe(1)
  })
})
