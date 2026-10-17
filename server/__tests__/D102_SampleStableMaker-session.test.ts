import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { getCardEffect, getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { runSelectionEffect } from '../../shared/actions/helpers/selection-effect-registry'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import type { GameState, PlayerState , ActionFlow } from '../../shared/contract/types'

import '../../shared/cards/D/D102_SampleStableMaker'
import '../../shared/cards/B/B085_FarmHand'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertRuleOutcome, confirmNext } from './_helpers/negative-rule-audit'
import * as audit03Stables from './_helpers/audit/ae-negative-03-stables'

const CARD_ID = 'D102_SampleStableMaker'
const FIELD_EFFECT = 'sample-stable-maker-return'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood' as const,
    fields: [], fences: 0, roomTiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
    stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [],
    cardStates: {},
  }) as unknown as PlayerState

const createState = (players: PlayerState[]): GameState =>
  ({
    round: 5, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as unknown as GameState

describe('D102_SampleStableMaker card effect', () => {
  const createOwner = () => {
    const player = createPlayer('p1')
    player.occupationPlayed.push(CARD_ID)
    return player
  }

  it('onStartReturnHome returns undefined when the player has no stables', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.stableTiles = []
    const state = createState([player])
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()
    const flow = withActiveRegistry(ruleRegistry, () => effect!.onStartReturnHome!(state, player))
    expect(flow).toBeUndefined()
  })


  it('onStartReturnHome offers optional selection + minor improvement', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 1, col: 0 },
    ]
    const state = createState([player])
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    const flow = withActiveRegistry(ruleRegistry, () => effect!.onStartReturnHome!(state, player)) as Extract<ActionFlow, { type: 'seq' }>
    expect(flow).toBeDefined()
    expect(flow.type).toBe('seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(2)
    expect(flow.children[0].actionId).toBe('selection')
    expect(flow.children[0].actionContext.selectionEffect).toBe(FIELD_EFFECT)
    expect(flow.children[0].actionContext.selectionKind).toBe('farm-position')
    expect(flow.children[0].actionContext.maxSelections).toBe(1)
    expect(flow.children[1].actionId).toBe('improvement')
    expect(flow.children[1].optional).toBe(true)
    expect(flow.children[1].sourceCard).toBe(CARD_ID)
  })

  it('selection-effect removes exactly 1 stable and grants 1 wood, 1 grain, 1 food', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.stableTiles = [
      { row: 0, col: 0 }, { row: 1, col: 0 },
    ]
    const initial = {
      wood: player.resources.wood,
      grain: player.resources.grain,
      food: player.resources.food,
    }
    withActiveRegistry(ruleRegistry, () => runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['0-0'],
      sourceCard: CARD_ID,
    }))
    expect(player.stableTiles).toHaveLength(1)
    expect(player.stableTiles[0]).toEqual({ row: 1, col: 0 })
    expect(player.resources.wood).toBe(initial.wood + 1)
    expect(player.resources.grain).toBe(initial.grain + 1)
    expect(player.resources.food).toBe(initial.food + 1)
  })

  it('selection-effect does nothing when no selection is made', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.stableTiles = [{ row: 0, col: 0 }]
    const initial = {
      wood: player.resources.wood,
      grain: player.resources.grain,
      food: player.resources.food,
    }
    withActiveRegistry(ruleRegistry, () => runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: [],
      sourceCard: CARD_ID,
    }))
    expect(player.stableTiles).toHaveLength(1)
    expect(player.resources.wood).toBe(initial.wood)
    expect(player.resources.grain).toBe(initial.grain)
    expect(player.resources.food).toBe(initial.food)
  })

  it('offers the B85 FarmHand tile as a selection candidate', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.stableTiles = []
    if (!player.occupationPlayed.includes('B085_FarmHand')) player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      B085_FarmHand: { extraData: { position: { row: 2, col: 1 } } },
    }
    const state = createState([player])
    const flow = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID)!.onStartReturnHome!(state, player)) as Extract<ActionFlow, { type: 'seq' }>
    expect(flow).toBeDefined()
    const selection = flow.children[0]
    expect(selection.actionContext.selectableTiles).toEqual([{ row: 2, col: 1 }])
  })

  it('returns the B85 FarmHand tile and pays the normal resource reward', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.occupationPlayed.push('B085_FarmHand')
    player.stableTiles = []
    if (!player.occupationPlayed.includes('B085_FarmHand')) player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      B085_FarmHand: {
        flagged: true,
        extraData: { position: { row: 2, col: 1 } },
      },
    }
    const initial = {
      wood: player.resources.wood,
      grain: player.resources.grain,
      food: player.resources.food,
    }
    expect(withActiveRegistry(ruleRegistry, () => getExtraRoomCapacity(player))).toBe(1)
    withActiveRegistry(ruleRegistry, () => runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['2-1'],
      sourceCard: CARD_ID,
    }))
    // FarmHand tile cleared from cardStates, but `flagged` stays true so
    // the player cannot rebuild it.
    expect(player.cardStates!.B085_FarmHand!.extraData?.position).toBeUndefined()
    expect(player.cardStates!.B085_FarmHand!.flagged).toBe(true)
    expect(player.stableTiles).toEqual([])
    expect(withActiveRegistry(ruleRegistry, () => getExtraRoomCapacity(player))).toBe(0)
    expect(player.resources.wood).toBe(initial.wood + 1)
    expect(player.resources.grain).toBe(initial.grain + 1)
    expect(player.resources.food).toBe(initial.food + 1)
  })

  it('returning the B85 FarmHand tile releases stable reserve', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const player = createOwner()
    player.stableTiles = [
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
    ]
    if (!player.occupationPlayed.includes('B085_FarmHand')) player.occupationPlayed.push('B085_FarmHand')
    player.cardStates = {
      B085_FarmHand: {
        flagged: true,
        extraData: { position: { row: 2, col: 1 } },
      },
    }
    const state = createState([player])
    expect(withActiveRegistry(ruleRegistry, () => getAvailableStableSupplyCount(state, player))).toBe(0)

    withActiveRegistry(ruleRegistry, () => runSelectionEffect(FIELD_EFFECT, {
      player,
      positions: ['2-1'],
      sourceCard: CARD_ID,
      state,
      cards: [],
    }))

    expect(withActiveRegistry(ruleRegistry, () => getAvailableStableSupplyCount(state, player))).toBe(1)
  })
})

describe('ae-negative-03-stables', () => {
  const { D102, sessions, ok, setup, choose, turn, returnWindow, returnSelection, makerGoods } = audit03Stables
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  describe('Sample Stable Maker negative audit', () => {
    it('D102 N1 real return gains once and offers only a minor improvement', () => {
      const s = setup({ card: D102, round: 5, stableCount: 2, resources: { clay: 2, stone: 2 } })
      const before = returnSelection(s)
      const baseline = makerGoods(before)
      let r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
      assert.deepEqual(makerGoods(r), { stables: 1, wood: 1, grain: 2, food: 41 })
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === D102)
      assert.ok(r.interaction.allowedCommands.includes('undoStep'))
      const undone = ok(s.undoStep())
      assert.deepEqual(makerGoods(undone), baseline)
      assert.ok(undone.interaction.stateId === 'wait' && undone.interaction.request.kind === 'selection')
      r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
      assert.deepEqual(makerGoods(r), { stables: 1, wood: 1, grain: 2, food: 41 })
      r = choose(s, r, o => o.value !== '__skip__')
      assertRejectedUnchanged(s, () => s.resolveChoice(0, 'Major_Pottery'))
      if (!r.state.players[0]!.minorPlayed.includes('D076_SocialBenefits')) r = ok(s.resolveChoice(0, 'D076_SocialBenefits'))
      assert.ok(r.state.players[0]!.minorPlayed.includes('D076_SocialBenefits'))
      assert.equal(r.state.players[0]!.resources.reed, 1)
    })
    it('D102 N2 nonexistent stable cannot grant exchange goods', () => {
      const s = setup({ card: D102, round: 5, stableCount: 2 })
      const r = returnSelection(s)
      const baseline = makerGoods(r)
      const bad = s.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] })
      const outcome = { accepted: bad.ok, ...makerGoods(bad) }
      if (!bad.ok) {
        assert.deepEqual(makerGoods(bad), baseline)
        const good = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
        assert.deepEqual(makerGoods(good), { stables: 1, wood: 1, grain: 2, food: 41 })
      }
      assertRuleOutcome(outcome, { accepted: false, stables: 2, wood: 0, grain: 1, food: 40 })
    })
    it('D102 N3 duplicate or two stable selection is rejected before one legal return', () => {
      const s = setup({ card: D102, round: 5, stableCount: 2 })
      returnSelection(s)
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }, { row: 0, col: 1 }] }))
      assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }))
      const r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
      assert.deepEqual(makerGoods(r), { stables: 1, wood: 1, grain: 2, food: 41 })
    })
    it('D102 N4 declining a real return-home opportunity keeps both stables and all goods', () => {
      const s = setup({ card: D102, round: 5, stableCount: 2 })
      const r = choose(s, returnWindow(s), o => o.value === '__skip__')
      assert.deepEqual(makerGoods(r), { stables: 2, wood: 0, grain: 1, food: 40 })
      assert.equal(r.state.round, 6)
    })
    it('D102 N5 no built stable offers no return-home exchange', () => {
      const s = setup({ card: D102, round: 5 })
      turn(s, 0, 'reed-bank'); turn(s, 1, 'forest'); turn(s, 0, 'grain-seeds')
      const r = confirmNext(s, turn(s, 1, 'clay-pit'))
      assert.equal(r.state.round, 6)
      assert.deepEqual(makerGoods(r), { stables: 0, wood: 0, grain: 1, food: 40 })
      assert.ok(r.interaction.stateId === 'idle')
    })
  })
})
