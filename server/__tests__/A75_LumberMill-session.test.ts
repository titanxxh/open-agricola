import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { A075_LumberMill } from '../../shared/cards/A/A075_LumberMill'
import { setWorkersAtHome } from '../../shared/domain/player'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import '../../shared/cards/A/A057_MilkingParlor'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState, type FarmTilePosition } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import { takeMajorImprovementFromSupply } from '../../shared/cards/major/supply'
import '../../shared/cards/A/A066_FeedingDish'
import '../../shared/cards/A/A078_Canoe'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const CARD_ID = 'A075_LumberMill'
const DISCOUNTED_MINOR_ID = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'
const OCCUPATIONS = [
  'A116_WoodCutter',
  'B116_Shoreforester',
  'C109_SchnappsDistiller',
  'D116_TreeInspector',
]

// Touch the import so the listener side-effect remains referenced.
void A075_LumberMill

describe('A075_LumberMill session', () => {
  const setup = (resources: Partial<Record<string, number>>) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.resources = {
      ...player.resources,
      wood: 0,
      clay: 0,
      reed: 0,
      stone: 0,
      food: 0,
      ...resources,
    }
    state.availableMajorImprovements = ['Major_Joinery']
    // Placeholder hands keep improvement option counts deterministic
    // (see CLAUDE.md Common Pitfalls).
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    state.players[1]!.minorHand = ['__test_placeholder__']
    state.players[1]!.occupationHand = ['__test_placeholder__']
    session.loadState(state)
    return session
  }

  const setupPurchase = (occupations: number) => {
    const session = sessionEvidence.track(createWorkSession({ seed: 5075, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorHand = [CARD_ID]
    player.occupationHand = [FILLER]
    player.occupationPlayed = OCCUPATIONS.slice(0, occupations)
    player.resources.stone = 2
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)
    return session
  }

  const enterImprovementChoice = (session: GameSession) => {
    let response = session.takeAction(0, 'major-improvement')
    if (response.interaction.stateId !== 'wait') return response
    const improvement = getChoiceOptions(response)?.find((option) =>
      option.value.startsWith('action-improvement-'))
    if (improvement) response = session.resolveChoice(0, improvement.value)
    return response
  }

  const playMinor = (session: GameSession, cardId: string) => {
    const response = enterImprovementChoice(session)
    if (!response.state.players[0]!.minorHand.includes(cardId)) return response
    if (response.interaction.stateId !== 'wait') return response
    const option = getChoiceOptions(response)?.find((candidate) => candidate.value === cardId)
    if (!option) return response
    return session.resolveChoice(0, option.value)
  }

  it('A075 S1: exactly three occupations allow paying two stone for Lumber Mill', () => {
    const response = playMinor(setupPurchase(3), CARD_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(0)
  })

  it('A075 S2: four occupations keep Lumber Mill unavailable without payment', () => {
    const response = enterImprovementChoice(setupPurchase(4))

    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
    expect(response.state.players[0]!.resources.stone).toBe(2)
  })

  // Mandatory closure transform (ADR 0004): the printed {wood:2, stone:2}
  // row is never offered — Mandatory Saturation hides it, the player can
  // only pay the discounted {wood:1, stone:2}.
  it('A075 S3: discounts a major improvement by one wood and never offers the printed cost', () => {
    const session = setup({ wood: 2, stone: 2 })
    let resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'prompt.selectPayment') {
      const options = getChoiceOptions(resp) ?? []
      const printed = options.find((entry) =>
        entry.effectPreview?.kind === 'payment' && entry.effectPreview.resourcesPaid?.wood === 2,
      )
      expect(printed).toBeUndefined()
      const discounted = options.find((entry) =>
        entry.effectPreview?.kind === 'payment' && entry.effectPreview.resourcesPaid?.wood === 1,
      )
      expect(discounted).toBeDefined()
      resp = session.resolveChoice(0, discounted!.value)
    }

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(1)
    expect(after.resources.stone).toBe(0)
  })

  // With exactly the discounted cost on hand the purchase resolves without
  // a payment wait: the closure leaves a single affordable candidate.
  it('auto-resolves payment when only the discounted candidate is affordable', () => {
    const session = setup({ wood: 1, stone: 2 })
    const resp = session.takeAction(0, 'major-improvement')
    expect(resp.ok).toBe(true)

    const after = resp.state.players[0]!
    expect(after.improvements).toContain('Major_Joinery')
    expect(after.resources.wood).toBe(0)
    expect(after.resources.stone).toBe(0)
    expect(readCardResourceStats(after, CARD_ID)?.saved).toEqual({ wood: 1 })
  })

  it('A075 S4: discounts a minor improvement by one wood', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 6075, options: { playerCount: 2 } }))
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    state.roundPhase = 'work'
    state.availableMajorImprovements = []
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.minorPlayed = [CARD_ID]
    player.minorHand = [DISCOUNTED_MINOR_ID]
    player.occupationHand = [FILLER]
    player.resources.wood = 1
    const opponent = state.players[1]!
    setWorkersAtHome(state, opponent, 2)
    opponent.minorHand = [FILLER]
    opponent.occupationHand = [FILLER]
    session.loadState(state)

    const response = playMinor(session, DISCOUNTED_MINOR_ID)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(DISCOUNTED_MINOR_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })
})

describe("A075 command boundaries", () => {
  const MILL = 'A075_LumberMill'
  function setup({ played = true, resources = {}, majors = [], occupations = 0, configure = () => {
  } }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    majors?: string[]
    occupations?: number
    configure?: (state: GameState) => void
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 5
        state.players.forEach(p => {
          p.minorHand = ['B007_Wage', 'A016_RammedClay', 'A054_Credit']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 20, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.minorPlayed = played ? [MILL] : []
        if (!played)
          p.minorHand.push(MILL)
        p.occupationPlayed = ['A116_WoodCutter', 'B116_Shoreforester', 'C109_SchnappsDistiller', 'D116_TreeInspector'].slice(0, occupations)
        p.fields = []
        p.improvements = majors
        majors.forEach(id => takeMajorImprovementFromSupply(state, id))
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    return s
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function res(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.resources
  }
  function opts(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, complete(r, 1 - actor))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const r = ok(s.takeAction(actor, space))
    assert.ok(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id))
    if (['grain-seeds', 'reed-bank', 'clay-pit'].includes(space)) complete(r, actor)
    return r
  }
  function complete(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
  function enter(s: GameSession, actor = 0, space = 'meeting-place') {
    let r = turn(s, actor, space)
    const branch = opts(r).find(o => o.value.startsWith('action-improvement-'))
    if (branch)
      r = ok(s.resolveChoice(actor, branch.value))
    return r
  }
  function purchase(s: GameSession, r: SessionResponse, card: string, actor = 0) {
    assert.ok(opts(r).some(o => o.value === card && !o.disabled))
    r = ok(s.resolveChoice(actor, card))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && r.interaction.promptKey === 'prompt.selectPayment') {
      const choices = opts(r).filter(o => o.value !== 'cancel' && !o.disabled)
      assert.equal(choices.length, 1, JSON.stringify(r.interaction))
      const choice = choices[0]!
      r = ok(s.resolveChoice(actor, choice.value))
    }
    assert.ok(r.state.players[actor]!.minorPlayed.includes(card) || r.state.players[actor]!.improvements.includes(card))
    const events = r.state.events.filter(e => 'cardId' in e && e.cardId === card && 'payment' in e)
    assert.equal(events.length, 1)
    return r
  }
  function buy(s: GameSession, card: string) {
    return complete(purchase(s, enter(s), card))
  }
  function deny(s: GameSession, card: string, space = 'meeting-place') {
    const r = enter(s, 0, space)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    const retry = complete(purchase(s, r, 'A016_RammedClay'))
    assert.ok(retry.state.players[0]!.minorHand.includes(card) || card.startsWith('Major_'))
    return retry
  }
  function farm(s: GameSession, kind: 'stable', actor = 0) {
    const r = turn(s, actor, 'farm-expansion')

    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === kind, JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function stable(s: GameSession, tiles: FarmTilePosition[] = [{ row: 1, col: 1 }, { row: 1, col: 2 }], actor = 0) {
    farm(s, 'stable', actor)
    const r = ok(s.commitSelectionChoice(actor, { stables: tiles }))
    assert.equal(r.state.players[actor]!.stableTiles.length, tiles.length)
    assert.equal(s.withCtx(() => getAvailableStableSupplyCount(r.state, r.state.players[actor]!)), 4 - tiles.length)
    return r
  }
  function undo(s: GameSession, before: string, beforeInteraction: string, retry: () => SessionResponse) {
    const restored = s.undoAction()
    assertUndoRestored(before, restored)
    assert.equal(JSON.stringify(restored.interaction), beforeInteraction)
    assert.equal(JSON.stringify(s.getState().interaction), beforeInteraction)
    assert.equal(restored.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    return retry()
  }
  it("zero occupations permit paying two stone for Lumber Mill", () => {
    const r = buy(setup({ played: false, resources: { stone: 2 } }), MILL)
    assert.equal(res(r).stone, 0)
  })
  it("exactly three occupations permit the actual purchase and two printed points", () => {
    const r = buy(setup({ played: false, resources: { stone: 2 }, occupations: 3 }), MILL)
    assert.equal(res(r).stone, 0)
    assert.equal(r.scores?.[0]?.categories.find(c => c.key === 'cards')?.entries.find(e => 'cardId' in e && e.cardId === MILL)?.score, 2)
  })
  it("four occupations reject the forged purchase before a legal retry", () => {
    deny(setup({ played: false, resources: { stone: 2 }, occupations: 4 }), MILL)
  })
  it("one stone short rejects the forged purchase before a legal retry", () => {
    deny(setup({ played: false, resources: { stone: 1 } }), MILL)
  })
  it("actual Joinery purchase pays one wood and two stone", () => {
    const s = setup({ resources: { wood: 1, stone: 2 } })
    const r = complete(purchase(s, enter(s, 0, 'major-improvement'), 'Major_Joinery'))
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).stone, 0)
    assert.equal(r.state.availableMajorImprovements.includes('Major_Joinery'), false)
  })
  it("zero wood cannot pay the still positive discounted Joinery fee", () => {
    deny(setup({ resources: { stone: 2 } }), 'Major_Joinery', 'major-improvement')
  })
  it("one wood Feeding Dish becomes free without gaining wood", () => {
    const s = setup({ configure(state) {
        state.players[0]!.minorHand.push('A066_FeedingDish')
      } })
    const r = buy(s, 'A066_FeedingDish')
    assert.equal(res(r).wood, 0)
  })
  it("two wood Canoe costs one wood with its independent occupation prerequisite", () => {
    const s = setup({ occupations: 1, resources: { wood: 1 }, configure(state) {
        state.players[0]!.minorHand.push('A078_Canoe')
      } })
    const r = buy(s, 'A078_Canoe')
    assert.equal(res(r).wood, 0)
  })
  it("nonwood Fan fee remains one reed with a real baking provider", () => {
    const s = setup({ majors: ['Major_Fireplace1'], resources: { reed: 1 }, configure(state) {
        state.players[0]!.minorHand.push('A061_WinnowingFan')
      } })
    const r = buy(s, 'A061_WinnowingFan')
    assert.equal(res(r).reed, 0)
    assert.equal(res(r).wood, 0)
  })
  it("a real fourth occupation after Lumber Mill does not disable its discount", () => {
    const s = setup({ occupations: 3, configure(state) {
        state.players[0]!.occupationHand = ['D116_TreeInspector']
        state.players[0]!.minorHand.push('A066_FeedingDish')
      } })
    let r = complete(turn(s, 0, 'lessons'))
    assert.equal(r.state.players[0]!.occupationPlayed.length, 4)
    turn(s, 1, 'grain-seeds')
    r = buy(s, 'A066_FeedingDish')
    assert.equal(res(r).wood, 0)
  })
  it("opponent actual Joinery purchase still pays its printed fee", () => {
    const s = setup({ configure(state) {
        Object.assign(state.players[1]!.resources, { wood: 2, stone: 2 })
      } })
    turn(s, 0, 'grain-seeds')
    const r = complete(purchase(s, enter(s, 1, 'major-improvement'), 'Major_Joinery', 1), 1)
    assert.equal(res(r, 1).wood, 0)
    assert.equal(res(r, 1).stone, 0)
  })
  it("real stable construction still costs two wood", () => {
    const r = complete(stable(setup({ resources: { wood: 2 } }), [{ row: 1, col: 1 }]))
    assert.equal(res(r).wood, 0)
  })
  it("undo discounted Joinery purchase restores resources and supply before one retry", () => {
    const s = setup({ resources: { wood: 1, stone: 2 } })
    const initial = s.getState()
    assert.equal(initial.interaction.stateId, 'idle')
    assert.equal(initial.state.currentPlayerIndex, 0)
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    complete(purchase(s, enter(s, 0, 'major-improvement'), 'Major_Joinery'))
    const r = undo(s, before, beforeInteraction, () => complete(purchase(s, enter(s, 0, 'major-improvement'), 'Major_Joinery')))
    assert.equal(res(r).wood, 0)
    assert.equal(res(r).stone, 0)
  })
  it("Lumber Mill in hand cannot discount a real Feeding Dish purchase", () => {
    const s = setup({ played: false, resources: { wood: 1 }, configure(state) {
        state.players[0]!.minorHand.push('A066_FeedingDish')
      } })
    const r = buy(s, 'A066_FeedingDish')
    assert.equal(res(r).wood, 0)
    assert.ok(r.state.players[0]!.minorHand.includes(MILL))
  })
})
