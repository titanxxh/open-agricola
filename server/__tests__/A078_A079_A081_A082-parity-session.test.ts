import { createWorkSession } from './_helpers/session-fixtures'
import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { markAllWorkersUsed, setWorkersAtHome, workersAtHome } from '../../shared/domain/player'
import { setStoredResource, getStoredResource } from '../../shared/cards/helpers/card-storage'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { resolveTriggerIfPresent , expectWait } from './_helpers/trigger-select'
import { autoAdvanceRoundEnd } from '../../tests/llm-card-gen/session-helpers'
import '../../shared/cards/A/A078_Canoe'
import '../../shared/cards/A/A079_GardenHoe'
import '../../shared/cards/A/A081_InterimStorage'
import '../../shared/cards/A/A082_WorkCertificate'
import assert from 'node:assert/strict'
import { type PlayerState, type GameState, type FarmTilePosition } from '../../shared/contract/types'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { getAvailableStableSupplyCount, getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import '../../shared/cards/A/A073_AgriculturalFertilizers'
import '../../shared/cards/A/A115_ChiefForester'
import '../../shared/cards/A/A071_ClearingSpade'

const sessionEvidence = createScenarioEvidence(import.meta.url)

const FILLER = '__test_placeholder__'
const OCCUPATIONS = ['A116_WoodCutter', 'B121_Geologist', 'C123_Freemason']

const options = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response) ?? []
  : []

const setup = ({
  cardId, played = true, round = 14, playerCount = 2, occupations = 0, resources = {},
}: {
  cardId: string
  played?: boolean
  round?: number
  playerCount?: number
  occupations?: number
  resources?: Record<string, number>
}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 7080 + round, options: { playerCount } }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = round
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.actionSpaces.forEach((space) => { space.takenBy = [] })
  state.players.forEach((player) => {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.cardStates = {}
    player.fields = []
    player.resources = {
      ...player.resources, wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0,
      vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    }
  })
  const owner = state.players[0]!
  owner.minorHand = played ? [FILLER] : [cardId]
  owner.minorPlayed = played ? [cardId] : []
  owner.occupationPlayed = OCCUPATIONS.slice(0, occupations)
  Object.assign(owner.resources, resources)
  session.loadState(state)
  return session
}

const playMinor = (session: GameSession, cardId: string) => {
  let response = session.takeAction(0, 'meeting-place')
  for (let guard = 0; guard < 8 && response.state.players[0]!.minorHand.includes(cardId); guard += 1) {
    if (response.interaction.stateId !== 'wait') break
    const card = options(response).find((option) => option.value === cardId)
    const branch = options(response).find((option) => option.value.startsWith('action-improvement-'))
    const next = card ?? branch
    if (!next) break
    response = session.resolveChoice(response.interaction.playerIndex, next.value)
  }
  return response
}

describe('A078 Canoe parity', () => {
  const CARD_ID = 'A078_Canoe'

  it('A078 S1: one occupation and two wood allow Canoe to be played', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, occupations: 1, resources: { wood: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A078 S2: fewer than one occupation keep Canoe unavailable', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, resources: { wood: 2 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A078 S3: Fishing gains its food plus one additional food and reed', () => {
    const session = setup({ cardId: CARD_ID, resources: { food: 0 } })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'fishing')!.resources.food = 3
    session.loadState(state)
    const response = session.takeAction(0, 'fishing')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, reed: 1 })
  })

  it('A078 S4: a non-Fishing action grants no Canoe bonus', () => {
    const response = setup({ cardId: CARD_ID, resources: { food: 0 } }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 0 })
  })
})

describe('A079 Garden Hoe parity', () => {
  const CARD_ID = 'A079_GardenHoe'

  const sowSession = (crop: 'grain' | 'vegetable') => {
    const session = setup({ cardId: CARD_ID, resources: { [crop]: 1 } })
    const state = session.getState().state
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'
    state.players[0]!.fields = [{ row: 0, col: 1, stacks: [] }]
    session.loadState(state)
    const pending = session.takeAction(0, 'grain-utilization')
    expect(pending.interaction).toMatchObject({
      stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } },
    })
    return session.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop }] })
  }

  it('A079 S1: paying one wood plays Garden Hoe', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, resources: { wood: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.wood).toBe(0)
  })

  it('A079 S2: an unconditional Sow planting vegetable gains one clay and one stone', () => {
    const response = sowSession('vegetable')
    expect(response.state.players[0]!.resources).toMatchObject({ vegetable: 0, clay: 1, stone: 1 })
  })

  it('A079 S3: an unconditional Sow planting only grain grants no Garden Hoe resources', () => {
    const response = sowSession('grain')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })

  it('A079 S4: no vegetable planted leaves Garden Hoe unchanged', () => {
    const response = setup({ cardId: CARD_ID }).takeAction(0, 'day-laborer')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 0 })
  })
})

describe('A081 Interim Storage parity', () => {
  const CARD_ID = 'A081_InterimStorage'

  it('A081 S1: paying two food plays Interim Storage', () => {
    const poor = setup({ cardId: CARD_ID, played: false, resources: { food: 1 } })
    const state = poor.getState().state
    state.players[0]!.minorHand = [CARD_ID, 'B007_Wage']
    poor.loadState(state)
    const pending = expectWait(poor.takeAction(0, 'meeting-place'))
    expect(pending.interaction.request.kind).toBe('choice')
    expect(getChoiceOptions(pending).filter(option => option.value === CARD_ID && !option.disabled)).toHaveLength(0)
    assertRejectedUnchanged(poor, () => poor.resolveChoice(0, CARD_ID))

    const response = playMinor(setup({
      cardId: CARD_ID, played: false, resources: { food: 2 },
    }), CARD_ID)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect({
      wood: getStoredResource(response.state.players[0]!, CARD_ID, 'wood'),
      clay: getStoredResource(response.state.players[0]!, CARD_ID, 'clay'),
      reed: getStoredResource(response.state.players[0]!, CARD_ID, 'reed'),
    }).toEqual({ wood: 0, clay: 0, reed: 0 })
  })

  for (const { scenario, action, collected, stored } of [
    { scenario: 'S2', action: 'clay-pit', collected: 'clay', stored: 'wood' },
    { scenario: 'S3', action: 'reed-bank', collected: 'reed', stored: 'clay' },
    { scenario: 'S4', action: 'eastern-quarry', collected: 'stone', stored: 'reed' },
  ] as const) {
    it(`A081 ${scenario}: using ${collected} accumulation stores one ${stored} on Interim Storage`, () => {
      const session = setup({ cardId: CARD_ID, round: 6 })
      const state = session.getState().state
      state.actionSpaces.find((space) => space.id === action)!.resources[collected] = 2
      session.loadState(state)
      const response = session.takeAction(0, action)
      expect(response.state.players[0]!.resources[collected]).toBe(2)
      expect(getStoredResource(response.state.players[0]!, CARD_ID, stored)).toBe(1)
    })
  }

  it('A081 S5: a wood accumulation space stores nothing on Interim Storage', () => {
    const session = setup({ cardId: CARD_ID, round: 6 })
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 3
    session.loadState(state)
    const response = session.takeAction(0, 'forest')
    expect(getStoredResource(response.state.players[0]!, CARD_ID, 'wood')).toBe(0)
  })

  it('A081 S6: at round seven all stored wood clay and reed move to the supply', () => {
    const session = setup({ cardId: CARD_ID, round: 6, resources: { wood: 0, clay: 0, reed: 0 } })
    const state = session.getState().state
    for (const resource of ['wood', 'clay', 'reed'] as const) {
      setStoredResource(state.players[0]!, CARD_ID, resource, 1)
    }
    state.players.forEach((player) => markAllWorkersUsed(state, player))
    session.loadState(state)
    autoAdvanceRoundEnd(session)
    const response = session.getState()
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 1, clay: 1, reed: 1 })
    for (const resource of ['wood', 'clay', 'reed'] as const) {
      expect(getStoredResource(response.state.players[0]!, CARD_ID, resource)).toBe(0)
    }
  })
})

describe('A082 Work Certificate parity', () => {
  const CARD_ID = 'A082_WorkCertificate'

  it('A082 S1: three occupations and one food allow Work Certificate to be played', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, occupations: 3, resources: { food: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A082 S2: fewer than three occupations keep Work Certificate unavailable', () => {
    const response = playMinor(setup({
      cardId: CARD_ID, played: false, occupations: 2, resources: { food: 1 },
    }), CARD_ID)
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  const certificateSession = (forestWood: number) => {
    const session = setup({ cardId: CARD_ID })
    const state = session.getState().state
    for (const space of state.actionSpaces) {
      for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) space.resources[resource] = 0
    }
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = forestWood
    session.loadState(state)
    return session
  }

  const enterCertificate = (session: GameSession) =>
    resolveTriggerIfPresent(session, session.takeAction(0, 'day-laborer'), CARD_ID)

  it('A082 S3: after another action Work Certificate may take one wood from a four-wood Forest', () => {
    const session = certificateSession(4)
    let response = enterCertificate(session)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return
    const wood = options(response).find((option) =>
      option.value !== '__skip__' && !option.disabled && option.effectPreview
        && 'resourcesGained' in option.effectPreview && option.effectPreview.resourcesGained?.wood === 1)
    expect(wood).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, wood!.value)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
  })

  it('A082 S4: the Work Certificate take may be declined', () => {
    const session = certificateSession(4)
    let response = enterCertificate(session)
    assert.ok(response.interaction.stateId === 'wait')
    assert.ok(options(response).some(option => option.value === '__skip__' && !option.disabled))
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.state.players[0]!.resources.wood).toBe(0)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(4)
  })

  it('A082 S5: a three-resource Forest is below the Work Certificate threshold', () => {
    const response = certificateSession(3).takeAction(0, 'day-laborer')
    expect(JSON.stringify(response.interaction)).not.toContain(CARD_ID)
    expect(response.state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood).toBe(3)
  })
})

describe("A078 command boundaries", () => {
  const CANOE = 'A078_Canoe', WAGE = 'B007_Wage'
  function setup({ played = true, resources = {}, occupations = [], fishing = 2 }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    occupations?: string[]
    fishing?: number
  } = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 1077, configure: state => {
        state.round = 14
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          p.cardStates = {}
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, food: 40, begging: 0 })
        }
        const owner = state.players[0]!
        owner.minorHand = [...(!played ? [CANOE, WAGE, 'A016_RammedClay'] : []), '__test_placeholder__']
        owner.minorPlayed = played ? [CANOE] : []
        owner.occupationPlayed = occupations
        Object.assign(owner.resources, resources)
        state.actionSpaces.find(a => a.id === 'fishing')!.resources.food = fishing
        state.actionSpaces.find(a => a.id === 'forest')!.resources.wood = 3
      } }))
    for (const p of s.state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(workersAtHome(s.state, p).length, 2)
      assert.equal(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)), 15)
      assert.equal(s.withCtx(() => getAvailableStableSupplyCount(s.state, p)), 4)
    }
    return s
  }
  function confirmed(r: SessionResponse, actor = 0) {
    assert.equal(r.ok, true, r.error)
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    return r
  }
  function restoredInteraction(s: GameSession, r: SessionResponse, expected: string, actor = 0) {
    assert.equal(JSON.stringify(r.interaction), expected)
    assert.equal(JSON.stringify(s.getState().interaction), expected)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(s.getState().state.currentPlayerIndex, actor)
  }
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function opts(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, confirmed(r, 1 - actor))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    const before = ready(s, actor), r = ok(s.takeAction(actor, space))
    sessionEvidence.record('take-action', { command: 'takeAction', actor, space, before, response: r })
    if (['forest', 'day-laborer', 'fishing', 'eastern-quarry', 'western-quarry'].includes(space)) confirmed(r, actor)
    return r
  }
  function choose(s: GameSession, r: SessionResponse, value: string) {
    assert.ok(r.interaction.stateId === 'wait')
    assert.ok(opts(r).some(o => o.value === value && !o.disabled))
    return ok(s.resolveChoice(r.interaction.playerIndex, value))
  }
  function menu(s: GameSession) {
    let r = turn(s, 0, 'meeting-place')
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice') {
      const o = getChoiceOptions(r).find(o => o.value.startsWith('action-improvement-'))
      if (o)
        r = choose(s, r, o.value)
    }
    sessionEvidence.record('minor-menu', r)
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = menu(s)
    assert.ok(opts(r).some(o => o.value === card && !o.disabled))
    const bought = choose(s, r, card)
    sessionEvidence.record('actual-purchase', { before: r, card, response: bought })
    return confirmed(bought)
  }
  function deny(s: GameSession, card: string) {
    const r = menu(s)
    assert.equal(opts(r).some(o => o.value === card && !o.disabled), false)
    const denied = assertRejectedUnchanged(s, () => s.resolveChoice(0, card))
    sessionEvidence.record('rejected-native-card', { before: r, card, response: denied })
    const food = r.state.players[0]!.resources.food
    const retry = confirmed(choose(s, r, WAGE))
    assert.equal(retry.state.players[0]!.resources.food - food, 2)
    assert.equal(retry.state.players[0]!.minorPlayed.includes(card), false)
    sessionEvidence.record('legal-original-pending-retry', retry)
  }
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length
  }
  function purchaseUndo(s: GameSession, before: string, beforeInteraction: string) {
    const r = s.undoAction()
    assertUndoRestored(before, r)
    restoredInteraction(s, r, beforeInteraction)
    sessionEvidence.record('purchase-undo', r)
  }
  function printedVp(r: SessionResponse, card: string) {
    assert.ok(r.scores)
    return r.scores[0]!.categories.find(c => c.key === 'cards')?.entries.filter(e => e.type === 'card' && e.cardId === card).reduce((sum, e) => sum + e.score, 0) ?? 0
  }
  function canoe(config: Parameters<typeof setup>[0] = {}) {
    return setup({ occupations: ['A124_Knapper'], ...config })
  }
  it("wood and occupation shortage reject before exact purchase and point", () => {
    deny(canoe({ played: false, resources: { wood: 1 } }), CANOE)
    deny(canoe({ played: false, resources: { wood: 2 }, occupations: [] }), CANOE)
    const r = buy(canoe({ played: false, resources: { wood: 2 } }), CANOE)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.food, 40)
    assert.equal(r.state.players[0]!.resources.reed, 0)
    assert.equal(printedVp(r, CANOE), 1)
  })
  it("actual Fishing after purchase adds exactly one food and reed", () => {
    const s = canoe({ played: false, resources: { wood: 2 } })
    buy(s, CANOE)
    turn(s, 1, 'forest')
    const r = turn(s, 0, 'fishing')
    assert.equal(r.state.players[0]!.resources.food, 43)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    assert.equal(r.state.actionSpaces.find(a => a.id === 'fishing')!.resources.food, 0)
    assert.equal(gainCount(r, CANOE), 1)
    assert.equal(printedVp(r, CANOE), 1)
  })
  it("actual opponent nonfishing and in hand exclude holder bonus", () => {
    const s = canoe()
    turn(s, 0, 'forest')
    const other = turn(s, 1, 'fishing')
    assert.equal(other.state.players[0]!.resources.food, 40)
    assert.equal(other.state.players[0]!.resources.reed, 0)
    assert.equal(other.state.players[1]!.resources.food, 42)
    assert.equal(other.state.players[1]!.resources.reed, 0)
    const non = turn(canoe(), 0, 'day-laborer')
    assert.equal(non.state.players[0]!.resources.food, 42)
    assert.equal(non.state.players[0]!.resources.reed, 0)
    const hand = turn(canoe({ played: false }), 0, 'fishing')
    assert.equal(hand.state.players[0]!.resources.food, 42)
    assert.equal(hand.state.players[0]!.resources.reed, 0)
    assert.equal(gainCount(hand, CANOE), 0)
  })
  it("occupied Fishing rejects before legal remaining worker control", () => {
    const s = canoe()
    turn(s, 0, 'fishing')
    turn(s, 1, 'forest')
    ready(s, 0)
    assertRejectedUnchanged(s, () => s.takeAction(0, 'fishing'))
    const r = turn(s, 0, 'day-laborer')
    assert.equal(r.state.players[0]!.resources.food, 45)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    assert.equal(gainCount(r, CANOE), 1)
  })
  it("actual purchase and Fishing undo restore piles goods workers and point", () => {
    const purchase = canoe({ played: false, resources: { wood: 2 } })
    const purchaseInitial = purchase.getState()
    assert.equal(purchaseInitial.interaction.stateId, 'idle')
    assert.equal(purchaseInitial.state.currentPlayerIndex, 0)
    const purchaseBeforeInteraction = JSON.stringify(purchaseInitial.interaction)
    const beforePurchase = undoRuleSnapshot(purchaseInitial)
    const bought = buy(purchase, CANOE)
    assert.equal(printedVp(bought, CANOE), 1)
    purchaseUndo(purchase, beforePurchase, purchaseBeforeInteraction)
    assert.equal(printedVp(purchase.getState(), CANOE), 0)
    assert.equal(printedVp(buy(purchase, CANOE), CANOE), 1)
    const s = canoe()
    const initial = s.getState()
    assert.equal(initial.interaction.stateId, 'idle')
    assert.equal(initial.state.currentPlayerIndex, 0)
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    turn(s, 0, 'fishing')
    const restored = s.undoAction()
    assertUndoRestored(before, restored)
    restoredInteraction(s, restored, beforeInteraction)
    const r = turn(s, 0, 'fishing')
    assert.equal(r.state.players[0]!.resources.food, 43)
    assert.equal(r.state.players[0]!.resources.reed, 1)
    assert.equal(gainCount(r, CANOE), 1)
    assert.equal(printedVp(r, CANOE), 1)
    sessionEvidence.record('Canoe-whole-use-undo-replay', r)
  })
})

describe("A079 command boundaries", () => {
  const FERT = 'A073_AgriculturalFertilizers', HOE = 'A079_GardenHoe'
  function pasture(state: GameState, cols = [4]) {
    const p = state.players[0]!
    p.pastures = [{ id: 'actual-pasture', tiles: cols.map(col => ({ row: 2, col })), animalType: null, animalCount: 0 }]
    const edges = cols.flatMap(col => [`H-2-${col}`, `H-3-${col}`]).concat([`V-2-${Math.min(...cols)}`, `V-2-${Math.max(...cols) + 1}`])
    p.fenceSegments = edges.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
  }
  function setup({ played = true, resources = {}, pastureCols = [], minor = [], configure = () => {
  } }: {
    played?: boolean
    resources?: Partial<PlayerState['resources']>
    pastureCols?: number[]
    minor?: string[]
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
        p.minorPlayed = played ? [HOE, ...minor] : minor
        if (!played)
          p.minorHand.push(HOE)
        p.fields = [{ row: 0, col: 1, stacks: [] }, { row: 0, col: 2, stacks: [] }]
        Object.assign(p.resources, resources)
        if (pastureCols.length)
          pasture(state, pastureCols)
        configure(state)
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    if (pastureCols.length)
      s.withCtx(() => assert.equal(getOwnOrdinaryFenceReserveCount(s.state.players[0]!), 15 - (2 * pastureCols.length + 2)))
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
  function sowSelect(s: GameSession, r: SessionResponse, actor = 0, expected: 'direct' | 'fertilizers' | 'forester' = 'direct') {
    const source = expected === 'fertilizers' ? FERT : expected === 'forester' ? 'A115_ChiefForester' : undefined
    if (source) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
      assert.equal(r.interaction.sourceCard, source)
      assert.equal(r.interaction.promptKey, 'ui.interactionOptionalAction')
      assert.equal(r.interaction.playerIndex, actor)
      assert.equal(r.state.currentPlayerIndex, actor)
      const choices = opts(r).filter(option => option.labelKey === 'actions.sow.name' && !option.disabled)
      assert.equal(choices.length, 1)
      assert.ok(opts(r).some(option => option.value === '__skip__' && !option.disabled))
      r = ok(s.resolveChoice(actor, choices[0]!.value))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select' && r.interaction.request.farm.farmType === 'sow', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.interaction.sourceCard, source)
    if (expected === 'forester') assert.equal(r.interaction.request.farm.maxSelections, 1)
    return r
  }
  function sow(s: GameSession, r: SessionResponse, crops: {
    row: number
    col: number
    crop: 'grain' | 'vegetable'
  }[], actor = 0, expected: 'direct' | 'fertilizers' = 'fertilizers') {
    sowSelect(s, r, actor, expected)
    return complete(ok(s.commitSelectionChoice(actor, { crops })), actor)
  }
  function normalSow(s: GameSession, crops: {
    row: number
    col: number
    crop: 'grain' | 'vegetable'
  }[], actor = 0) {
    return sow(s, turn(s, actor, 'grain-utilization'), crops, actor, 'direct')
  }
  function stack(r: SessionResponse, col: number, actor = 0) {
    return r.state.players[actor]!.fields.find(f => f.row === 0 && f.col === col)?.stacks?.[0]?.remaining ?? 0
  }
  function gain(r: SessionResponse, card: string, kind: 'clay' | 'stone') {
    return readCardResourceStats(r.state.players[0]!, card)?.gained[kind] ?? 0
  }
  function reward(r: SessionResponse, clay: number, stone: number) {
    assert.equal(res(r).clay, clay)
    assert.equal(res(r).stone, stone)
    assert.equal(gain(r, HOE, 'clay'), clay)
    assert.equal(gain(r, HOE, 'stone'), stone)
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
  it("actual Garden Hoe purchase pays one wood without an immediate reward", () => {
    const r = buy(setup({ played: false, resources: { wood: 1 } }), HOE)
    assert.equal(res(r).wood, 0)
    reward(r, 0, 0)
  })
  it("missing wood rejects the forged purchase before a legal retry", () => {
    deny(setup({ played: false }), HOE)
  })
  it("unrestricted Sow into two vegetable fields pays two seeds and rewards once", () => {
    const r = normalSow(setup({ resources: { vegetable: 2 } }), [{ row: 0, col: 1, crop: 'vegetable' }, { row: 0, col: 2, crop: 'vegetable' }])
    assert.equal(res(r).vegetable, 0)
    assert.equal(stack(r, 1), 2)
    assert.equal(stack(r, 2), 2)
    reward(r, 1, 1)
  })
  it("one vegetable and one grain in a real Sow reward once", () => {
    const r = normalSow(setup({ resources: { vegetable: 1, grain: 1 } }), [{ row: 0, col: 1, crop: 'vegetable' }, { row: 0, col: 2, crop: 'grain' }])
    assert.equal(res(r).vegetable, 0)
    assert.equal(res(r).grain, 0)
    assert.equal(stack(r, 1), 2)
    assert.equal(stack(r, 2), 3)
    reward(r, 1, 1)
  })
  it("grain only Sow beside an existing vegetable field gives no reward", () => {
    const s = setup({ resources: { grain: 1 }, configure(state) {
        state.players[0]!.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
      } })
    const r = normalSow(s, [{ row: 0, col: 2, crop: 'grain' }])
    assert.equal(stack(r, 1), 2)
    assert.equal(stack(r, 2), 3)
    reward(r, 0, 0)
  })
  it("zero planting after real Sow entry gives no reward", () => {
    const s = setup({ resources: { vegetable: 1 } })
    const pending = sowSelect(s, turn(s, 0, 'grain-utilization'))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [] }))
    reward(pending, 0, 0)
    const r = complete(ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] })))
    reward(r, 1, 1)
  })
  it("opponent actual vegetable Sow cannot reward the owner", () => {
    const s = setup({ configure(state) {
        state.players[1]!.resources.vegetable = 1
        state.players[1]!.fields = [{ row: 0, col: 1, stacks: [] }]
      } })
    turn(s, 0, 'grain-seeds')
    const r = normalSow(s, [{ row: 0, col: 1, crop: 'vegetable' }], 1)
    assert.equal(stack(r, 1, 1), 2)
    assert.equal(res(r, 1).vegetable, 0)
    reward(r, 0, 0)
  })
  it("Garden Hoe in hand cannot reward actual vegetable Sow", () => {
    const r = normalSow(setup({ played: false, resources: { vegetable: 1 } }), [{ row: 0, col: 1, crop: 'vegetable' }])
    assert.equal(stack(r, 1), 2)
    reward(r, 0, 0)
  })
  it("Chief Forester restricted one-field vegetable Sow gives no reward", () => {
    const s = setup({ resources: { vegetable: 1 }, configure(state) {
        state.players[0]!.occupationPlayed = ['A115_ChiefForester']
      } })
    const entered = turn(s, 0, 'forest')
    assert.ok(entered.interaction.stateId === 'wait')
    assert.equal(entered.interaction.sourceCard, 'A115_ChiefForester')
    const selected = sowSelect(s, entered, 0, 'forester')
    assert.ok(selected.interaction.stateId === 'wait')
    assert.equal(selected.interaction.sourceCard, 'A115_ChiefForester')
    const cursor = s.createSessionPrivateCursor()
    assert.ok(selected.interaction.request.kind === 'farm-select' && selected.interaction.request.farm.farmType === 'sow')
    assert.equal(selected.interaction.request.farm.maxSelections, 1)
    sessionEvidence.record('ChiefForester-source', { interaction: selected.interaction, sessionCursor: cursor, beforeResources: res(selected), beforeFields: selected.state.players[0]!.fields })
    const r = complete(ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] })))
    sessionEvidence.record('ChiefForester-completed', { state: r.state, interaction: r.interaction })
    assert.equal(stack(r, 1), 2)
    assert.equal(res(r).vegetable, 0)
    const actual = { restrictedOneField: true, vegetableStack: 2, clay: res(r).clay, stone: res(r).stone }
    assert.equal(gain(r, HOE, 'clay'), actual.clay)
    assert.equal(gain(r, HOE, 'stone'), actual.stone)
    assert.deepEqual(actual, { restrictedOneField: true, vegetableStack: 2, clay: 0, stone: 0 })
  })
  it("Fertilizers additional unrestricted vegetable Sow gives the printed reward", () => {
    const s = setup({ minor: [FERT], pastureCols: [4], resources: { wood: 4, vegetable: 1 } })
    const r = sow(s, stable(s), [{ row: 0, col: 1, crop: 'vegetable' }])
    assert.equal(res(r).wood, 0)
    assert.equal(stack(r, 1), 2)
    reward(r, 1, 1)
  })
  it("Clearing Spade actual vegetable transfer is not Sow", () => {
    const s = setup({ minor: ['A071_ClearingSpade'], configure(state) {
        state.players[0]!.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
      } })
    let r = ok(s.takeAnytimeAction(0, 'A71-clearing-spade-anytime'))
    assert.ok(r.interaction.stateId === 'wait')
    r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
    assert.ok(r.interaction.stateId === 'wait')
    r = ok(s.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] }))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, 0)
    assert.equal(r.state.roundPhase, 'work')
    assert.equal(stack(r, 1), 1)
    assert.equal(stack(r, 2), 1)
    reward(r, 0, 0)
  })
  it("illegal occupied or outside farm Sow targets reject before a valid vegetable planting", () => {
    const s = setup({ resources: { vegetable: 1 }, configure(state) {
        state.players[0]!.fields[0]!.stacks = [{ kind: 'vegetable', remaining: 2 }]
      } })
    sowSelect(s, turn(s, 0, 'grain-utilization'))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 0, col: 1, crop: 'vegetable' }] }))
    assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { crops: [{ row: 3, col: 0, crop: 'vegetable' }] }))
    const r = complete(ok(s.commitSelectionChoice(0, { crops: [{ row: 0, col: 2, crop: 'vegetable' }] })))
    reward(r, 1, 1)
    assert.equal(stack(r, 1), 2)
    assert.equal(stack(r, 2), 2)
  })
  it("undo actual vegetable Sow restores seed stacks and reward before one retry", () => {
    const s = setup({ resources: { vegetable: 1 } })
    const initial = s.getState()
    assert.equal(initial.interaction.stateId, 'idle')
    assert.equal(initial.state.currentPlayerIndex, 0)
    const beforeInteraction = JSON.stringify(initial.interaction)
    const before = undoRuleSnapshot(initial)
    normalSow(s, [{ row: 0, col: 1, crop: 'vegetable' }])
    const r = undo(s, before, beforeInteraction, () => normalSow(s, [{ row: 0, col: 1, crop: 'vegetable' }]))
    reward(r, 1, 1)
    assert.equal(res(r).vegetable, 0)
    assert.equal(stack(r, 1), 2)
  })
})
