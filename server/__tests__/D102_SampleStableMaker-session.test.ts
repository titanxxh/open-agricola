import { createInitialState } from '../../shared/session/state-bootstrap'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it } from 'vitest'
import { getCardEffect, getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { runSelectionEffect } from '../../shared/actions/helpers/selection-effect-registry'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import '../../shared/cards/D/D102_SampleStableMaker'
import '../../shared/cards/B/B085_FarmHand'
import assert from 'node:assert/strict'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, confirmNext, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'D102_SampleStableMaker'
const FIELD_EFFECT = 'sample-stable-maker-return'

const createPlayer = (id = 'p1'): PlayerState => {
  const player = createInitialState(1, { playerCount: 2 }).players[0]!
  player.id = id
  player.name = id
  player.minorHand = []
  player.occupationHand = []
  Object.assign(player.resources, { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 })
  return player
}

const createState = (players: PlayerState[]): GameState => ({
  ...createInitialState(1, { playerCount: 2 }), players,
})

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
    const flow = withActiveRegistry(ruleRegistry, () => effect!.onStartReturnHome!(state, player))
    assert.ok(flow?.type === 'seq')
    expect(flow.optional).toBe(true)
    expect(flow.children).toHaveLength(2)
    const selection = flow.children[0]
    assert.ok(selection?.type === 'leaf')
    expect(selection.actionId).toBe('selection')
    expect(selection.actionContext?.selectionEffect).toBe(FIELD_EFFECT)
    expect(selection.actionContext?.selectionKind).toBe('farm-position')
    expect(selection.actionContext?.maxSelections).toBe(1)
    const improvement = flow.children[1]
    assert.ok(improvement?.type === 'leaf')
    expect(improvement.actionId).toBe('improvement')
    expect(improvement.optional).toBe(true)
    expect(improvement.sourceCard).toBe(CARD_ID)
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
      state: createState([player]), cards: [], player,
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
      state: createState([player]), cards: [], player,
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
    const flow = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID)!.onStartReturnHome!(state, player))
    assert.ok(flow?.type === 'seq')
    const selection = flow.children[0]
    assert.ok(selection?.type === 'leaf')
    expect(selection.actionContext?.selectableTiles).toEqual([{ row: 2, col: 1 }])
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
      state: createState([player]), cards: [], player,
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
      player, positions: ['2-1'], sourceCard: CARD_ID, state, cards: [],
    }))

    expect(withActiveRegistry(ruleRegistry, () => getAvailableStableSupplyCount(state, player))).toBe(1)
  })
})

describe('D102 rule boundaries', () => {

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

  function returnWindow(s: GameSession) {
    turn(s, 0, 'reed-bank')
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    const r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.state.round, 5)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.grain, 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
    return r
  }

  function returnSelection(s: GameSession) {
    let r = returnWindow(s)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.sourceCard === D102)
    r = choose(s, r, o => o.value !== '__skip__')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'selection', JSON.stringify(r.interaction))
    return r
  }

  function makerGoods(r: SessionResponse) { const p = r.state.players[0]!; return { stables: p.stableTiles.length, wood: p.resources.wood, grain: p.resources.grain, food: p.resources.food } }

  it("real return gains once and offers only a minor improvement", () => {
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
    if (!r.state.players[0]!.minorPlayed.includes('D076_SocialBenefits'))
      r = ok(s.resolveChoice(0, 'D076_SocialBenefits'))
    assert.ok(r.state.players[0]!.minorPlayed.includes('D076_SocialBenefits'))
    assert.equal(r.state.players[0]!.resources.reed, 1)
  })

  it("nonexistent stable cannot grant exchange goods", () => {
    const s = setup({ card: D102, round: 5, stableCount: 2 })
    const r = returnSelection(s)
    const baseline = makerGoods(r)
    const supply = () => s.withCtx(() => getAvailableStableSupplyCount(s.state, s.state.players[0]!))
    assert.equal(supply(), 2)
    const bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 4 }] }))
    const outcome = { accepted: bad.ok, ...makerGoods(bad) }
    assert.equal(bad.ok, false)
    assert.deepEqual(makerGoods(bad), baseline)
    assert.equal(supply(), 2)
    const good = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
    assert.deepEqual(makerGoods(good), { stables: 1, wood: 1, grain: 2, food: 41 })
    assert.equal(supply(), 3)
    assert.deepEqual(outcome, { accepted: false, stables: 2, wood: 0, grain: 1, food: 40 })
  })

  it("duplicate or two stable selection is rejected before one legal return", () => {
    const s = setup({ card: D102, round: 5, stableCount: 2 })
    returnSelection(s)
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }, { row: 0, col: 1 }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }, { row: 0, col: 2 }] }))
    const r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
    assert.deepEqual(makerGoods(r), { stables: 1, wood: 1, grain: 2, food: 41 })
  })

  it("declining a real return-home opportunity keeps both stables and all goods", () => {
    const s = setup({ card: D102, round: 5, stableCount: 2 })
    const r = choose(s, returnWindow(s), o => o.value === '__skip__')
    assert.deepEqual(makerGoods(r), { stables: 2, wood: 0, grain: 1, food: 40 })
    assert.equal(r.state.round, 6)
    assert.equal(r.interaction.stateId, 'idle')
  })

  it("no built stable offers no return-home exchange", () => {
    const s = setup({ card: D102, round: 5 })
    turn(s, 0, 'reed-bank')
    turn(s, 1, 'forest')
    turn(s, 0, 'grain-seeds')
    const r = confirmNext(s, turn(s, 1, 'clay-pit'))
    assert.equal(r.state.round, 6)
    assert.deepEqual(makerGoods(r), { stables: 0, wood: 0, grain: 1, food: 40 })
    assert.ok(r.interaction.stateId === 'idle')
  })
})
