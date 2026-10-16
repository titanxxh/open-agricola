import { type GameSession as SessionRuleOwner, GameSession, type SessionResponse } from '../game/authoritative-session'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it } from 'vitest'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { executeCardListener, getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import '../../shared/cards/A/A087_Conservator'
import assert from 'node:assert/strict'
import { type GameState, type PlayerState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { getOwnOrdinaryFenceReserveCount } from '../../shared/domain/supply-tokens'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A087_Conservator'
const findListener = (ruleOwner: SessionRuleOwner | TestCardRegistry, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === id)
  return ruleOwner instanceof TestCardRegistry ? withActiveRegistry(ruleOwner, lookupRule1) : ruleOwner.withCtx(lookupRule1)
}
const setup = (overrides: {
  houseType?: 'wood' | 'clay' | 'stone'
  rooms?: number
  resources?: Partial<Record<string, number>>
  playA87?: boolean
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  const owner = state.players[0]!
  if (overrides.playA87 !== false) {
    owner.occupationPlayed.push(CARD_ID)
  }
  owner.houseType = overrides.houseType ?? 'wood'
  owner.rooms = overrides.rooms ?? 2
  if (overrides.resources) {
    Object.assign(owner.resources, overrides.resources)
  }
  session.loadState(state)
  return session
}
describe('A087_Conservator computeChoiceCandidates listener', () => {
  it('injects a stone target when wooden house owner takes renovate-house', () => {
    const session = setup({ houseType: 'wood', rooms: 2 })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-add-stone-renovation-target')
    expect(listener).toBeDefined()
    const result = session.withCtx(() => executeCardListener(listener!, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    }))
    expect(result?.extraOptions).toEqual([
      { value: 'stone', labelKey: 'ui.interactionConservatorDirectStone', sourceCard: CARD_ID },
    ])
  })
  it('is silent on a clay house (already past the wood tier)', () => {
    const session = setup({ houseType: 'clay' })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-add-stone-renovation-target')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    }))
    expect(result).toBeUndefined()
  })
  it('is silent when the player has not played A87', () => {
    const session = setup({ playA87: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-add-stone-renovation-target')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    }))
    expect(result).toBeUndefined()
  })
  it('does not filter by affordability — engine decides what is selectable', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 0, reed: 0 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-add-stone-renovation-target')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    }))
    expect(result?.extraOptions).toEqual([
      { value: 'stone', labelKey: 'ui.interactionConservatorDirectStone', sourceCard: CARD_ID },
    ])
  })
  it('legacy computeReplace listener is gone (no XOR top-level branch)', () => {
    const ruleRegistry = createOfficialCardRegistry()
    expect(findListener(ruleRegistry, 'A87-conservator-replace-renovate-house')).toBeUndefined()
  })
})
describe('A087_Conservator isDoable listener', () => {
  it('rescues entry visibility when wooden owner cannot afford clay tier but can afford stone tier', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1, clay: 0 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-isDoable-renovate-house')
    expect(listener).toBeDefined()
    const result = session.withCtx(() => executeCardListener(listener!, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    }))
    expect(result?.doable).toBe(true)
  })
  it('is silent when the action is already reported doable', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-isDoable-renovate-house')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    }))
    expect(result).toBeUndefined()
  })
  it('is silent when the player cannot afford the stone path either', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 1, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-isDoable-renovate-house')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    }))
    expect(result).toBeUndefined()
  })
  it('is silent on non-wooden houses (no wood→stone shortcut applies)', () => {
    const session = setup({
      houseType: 'clay',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-isDoable-renovate-house')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    }))
    expect(result).toBeUndefined()
  })
  it('is silent when the player has not played A87', () => {
    const session = setup({
      playA87: false,
      houseType: 'wood',
      rooms: 2,
      resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-isDoable-renovate-house')!
    const result = session.withCtx(() => executeCardListener(listener, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find(space => space.id === 'house-redevelopment')!,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    }))
    expect(result).toBeUndefined()
  })
})
describe('A087_Conservator session sourceCard', () => {
  it('does not stamp the whole renovation target prompt with sourceCard when only one option comes from the card', () => {
    const session = setup({
      houseType: 'wood',
      rooms: 2,
      resources: { clay: 2, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)
    const resp = session.takeAction(0, 'house-redevelopment')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    expect(resp.interaction.promptKey).toBe('ui.interactionChooseRenovationTarget')
    expect(resp.interaction.sourceCard).toBeUndefined()
    expect(getChoiceOptions(resp)?.find((option) => option.value === 'clay')?.sourceCard).toBeUndefined()
    expect(getChoiceOptions(resp)?.find((option) => option.value === 'stone')?.sourceCard).toBe(CARD_ID)
  })
})
const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = getChoiceOptions(response)?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}
const renovate = (session: GameSession, target?: 'clay' | 'stone') => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    expect(target).toBeDefined()
    const option = getChoiceOptions(response)?.find((candidate) => candidate.value === target)
    expect(option).toBeDefined()
    response = session.resolveChoice(response.interaction.playerIndex, option!.value)
  }
  return response
}
describe('A087 Conservator parity', () => {
  it('A087 S1: Conservator is played as the first occupation without paying food', () => {
    const session = setup({ playA87: false })
    const state = session.getState().state
    state.round = 6
    state.players.forEach((player) => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.resources.food = 0
    })
    state.players[0]!.occupationHand = [CARD_ID]
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = playOccupation(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('A087 S2: a wooden two-room house can renovate directly to stone for two stone and one reed', () => {
    const session = setup({
      houseType: 'wood', rooms: 2, resources: { clay: 0, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })

  it('A087 S3: when both renovation paths are affordable the player can choose direct stone', () => {
    const session = setup({
      houseType: 'wood', rooms: 2, resources: { clay: 2, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session, 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 2, stone: 0, reed: 0 })
  })

  it('A087 S4: Conservator can be declined by choosing the normal wood-to-clay renovation', () => {
    const session = setup({
      houseType: 'wood', rooms: 2, resources: { clay: 2, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session, 'clay')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources).toMatchObject({ clay: 0, stone: 2, reed: 0 })
  })

  it('A087 S5: without Conservator stone resources alone do not enable a wood-house renovation', () => {
    const session = setup({
      playA87: false, houseType: 'wood', rooms: 2, resources: { clay: 0, stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = session.takeAction(0, 'house-redevelopment')

    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.houseType).toBe('wood')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 2, reed: 1 })
    expect(response.state.actionSpaces.find((space) => space.id === 'house-redevelopment')?.takenBy).toEqual([])
  })

  it('A087 S6: a clay house follows the normal renovation path to stone', () => {
    const session = setup({
      houseType: 'clay', rooms: 2, resources: { stone: 2, reed: 1 },
    })
    const state = session.getState().state
    state.round = 6
    setWorkersAtHome(state, state.players[0]!, 2)
    session.loadState(state)

    const response = renovate(session)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('stone')
    expect(response.state.players[0]!.resources).toMatchObject({ stone: 0, reed: 0 })
  })
})
describe("A087 command boundaries", () => {
  const CONS = 'A087_Conservator'
  function artifact(name: string, data: object) {
    sessionEvidence.record(name, data)
  }
  type Setup = {
    played?: boolean
    round?: number
    house?: PlayerState['houseType']
    rooms?: number
    resources?: Partial<PlayerState['resources']>
    occupations?: number
    opponent?: boolean
    configure?: (state: GameState) => void
  }
  function setup({ played = true, round = 6, house = 'wood', rooms = 2, resources = {}, occupations = 0, opponent = false, configure = () => {
  } }: Setup = {}) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = round
        state.players.forEach(p => {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          p.improvements = []
          Object.assign(p.resources, { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, food: 0, sheep: 0, boar: 0, cattle: 0 })
        })
        const p = state.players[0]!
        p.houseType = house
        p.rooms = rooms
        p.roomTiles = [{ row: 1, col: 0 }, { row: 2, col: 0 }, ...Array.from({ length: rooms - 2 }, (_, n) => ({ row: 2, col: n + 1 }))]
        p.occupationPlayed = ['A116_WoodCutter'].slice(0, occupations)
        if (played && !opponent)
          p.occupationPlayed.push("A087_Conservator")
        else
          p.occupationHand.push("A087_Conservator")
        if (opponent)
          state.players[1]!.occupationPlayed = ["A087_Conservator"]
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    assert.equal(s.getState().interaction.stateId, 'idle')
    assert.equal(s.getState().state.players.length, 2)
    for (const p of s.getState().state.players) {
      assert.equal(p.workers.length, 5)
      assert.equal(p.workers.filter(w => w.isActive).length, 2)
      assert.equal(p.stableTiles.length, 0)
      assert.ok(s.withCtx(() => getOwnOrdinaryFenceReserveCount(p)) >= 0)
      if (p.fenceSegments.length)
        s.withCtx(() => assert.equal(getOwnOrdinaryFenceReserveCount(p), 15 - p.fenceSegments.length))
    }
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
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    const r = ok(s.takeAction(actor, space))
    assert.ok(r.state.actionSpaces.find(a => a.id === space)!.takenBy.some(w => w.playerId === r.state.players[actor]!.id))
    artifact('place', { space, actor, response: r })
    return r
  }
  function complete(r: SessionResponse, actor: number) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    assert.equal(r.interaction.playerIndex, actor)
    assert.equal(r.interaction.request.nextPlayerIndex, 1 - actor)
    assert.equal(r.state.currentPlayerIndex, actor)
    assert.equal(r.state.roundPhase, 'work')
    return r
  }
  function lessons(s: GameSession, card: string) {
    let r = turn(s, 0, 'lessons')
    if (r.state.players[0]!.occupationHand.includes(card)) {
      assert.ok(opts(r).some(o => o.value === card && !o.disabled))
      r = ok(s.resolveChoice(0, card))
    }
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment')
      r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== 'cancel')!.value))
    assert.ok(r.state.players[0]!.occupationPlayed.includes(card))
    return complete(r, 0)
  }
  function renoEntry(s: GameSession) {
    return turn(s, 0, 'house-redevelopment')
  }
  function renoFinish(s: GameSession, r: SessionResponse, target: 'clay' | 'stone', improvementOffered: boolean) {
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'ui.interactionChooseRenovationTarget')
      r = ok(s.resolveChoice(0, target))
    if (r.interaction.stateId === 'wait' && r.interaction.promptKey === 'prompt.selectPayment')
      r = ok(s.resolveChoice(0, opts(r).find(o => o.value !== 'cancel')!.value))
    if (improvementOffered) {
      assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
      assert.equal(r.interaction.promptKey, 'ui.interactionOptionalAction')
      assert.equal(r.interaction.sourceCard, undefined)
      assert.equal(r.interaction.playerIndex, 0)
      assert.equal(r.state.currentPlayerIndex, 0)
      const improvements = opts(r).filter(option => option.labelKey === 'actions.improvement.name' && !option.disabled)
      assert.equal(improvements.length, 1)
      assert.ok(opts(r).some(option => option.value === '__skip__' && !option.disabled))
      r = ok(s.resolveChoice(0, '__skip__'))
    }
    assert.equal(r.state.players[0]!.houseType, target)
    return complete(r, 0)
  }
  function renovate(s: GameSession, target: 'clay' | 'stone', improvementOffered: boolean) {
    return renoFinish(s, renoEntry(s), target, improvementOffered)
  }
  function denyHost(s: GameSession, space: string) {
    assertRejectedUnchanged(s, () => s.takeAction(0, space))
    complete(turn(s, 0, 'day-laborer'), 0)
    return { hostRejected: true, legalRetryCompleted: true }
  }
  function fields(r: SessionResponse, actor = 0) {
    return r.state.players[actor]!.fields.length
  }
  it("real first and later Lessons pay zero and one food without an immediate ability", () => {
    for (const prior of [0, 1]) {
      const s = setup({ played: false, occupations: prior, resources: { food: prior }, house: 'stone' })
      const r = lessons(s, CONS)
      assert.equal(res(r).food, 0)
      assert.equal(fields(r), 0)
      assert.equal(r.state.players[0]!.fenceSegments.length, 0)
    }
    return { firstFee: 0, laterFee: 1, immediateFields: 0, immediateFences: 0 }
  })
  it("missing the later Lessons food rejects a real forged entry before a legal action", () => {
    return denyHost(setup({ played: false, occupations: 1 }), 'lessons')
  })
  it("direct stone renovation pays two stone and one roof reed with wood 0", () => {
    const r = renovate(setup({ resources: { stone: 2, reed: 1, wood: 0 } }), 'stone', false)
    assert.equal(res(r).stone, 0)
    assert.equal(res(r).reed, 0)
    assert.equal(res(r).wood, 0)
    return { house: 'stone', stonePaid: 2, reedPaid: 1, wood: 0 }
  })
  it("direct stone renovation pays two stone and one roof reed with wood 1", () => {
    const r = renovate(setup({ resources: { stone: 2, reed: 1, wood: 1 } }), 'stone', false)
    assert.equal(res(r).stone, 0)
    assert.equal(res(r).reed, 0)
    assert.equal(res(r).wood, 1)
    return { house: 'stone', stonePaid: 2, reedPaid: 1, wood: 1 }
  })
  it("missing stone cannot substitute wood for the direct stone fee", () => {
    return denyHost(setup({ resources: { "stone": 1, "reed": 1, "wood": 10 } }), 'house-redevelopment')
  })
  it("missing reed cannot substitute wood for the direct stone fee", () => {
    return denyHost(setup({ resources: { "stone": 2, "reed": 0, "wood": 10 } }), 'house-redevelopment')
  })
  it("a real renovation menu rejects an invalid wood target and a foreign OA actor before legal clay", () => {
    const s = setup({ resources: { clay: 2, stone: 2, reed: 1 } })
    const r = renoEntry(s)
    assertRejectedUnchanged(s, () => s.resolveChoice(1, 'clay'))
    assertRejectedUnchanged(s, () => s.resolveChoice(0, 'wood'))
    const end = renoFinish(s, r, 'clay', false)
    assert.equal(res(end).clay, 0)
    assert.equal(res(end).stone, 2)
    assert.equal(res(end).reed, 0)
    return { invalidTargetRejected: true, house: 'clay', stone: 2, clay: 0, reed: 0 }
  })
  it("both affordable paths permit choosing stone while preserving the other material", () => {
    const r = renovate(setup({ resources: { clay: 2, stone: 2, reed: 1 } }), 'stone', true)
    assert.equal(res(r).stone, 0)
    assert.equal(res(r).clay, 2)
    assert.equal(res(r).reed, 0)
    return { house: 'stone', paidMaterial: 2, reedPaid: 1, otherMaterial: 2 }
  })
  it("both affordable paths permit choosing clay while preserving the other material", () => {
    const r = renovate(setup({ resources: { clay: 2, stone: 2, reed: 1 } }), 'clay', false)
    assert.equal(res(r).clay, 0)
    assert.equal(res(r).stone, 2)
    assert.equal(res(r).reed, 0)
    return { house: 'clay', paidMaterial: 2, reedPaid: 1, otherMaterial: 2 }
  })
  it("Conservator in hand cannot enable direct stone renovation", () => {
    return denyHost(setup({ played: false, resources: { stone: 2, reed: 1 } }), 'house-redevelopment')
  })
  it("only the opponent Conservator cannot enable direct stone renovation", () => {
    return denyHost(setup({ opponent: true, resources: { stone: 2, reed: 1 } }), 'house-redevelopment')
  })
  it("a clay house uses ordinary stone renovation with one roof reed", () => {
    const r = renovate(setup({ house: 'clay', resources: { stone: 2, reed: 1 } }), 'stone', false)
    assert.equal(res(r).stone, 0)
    assert.equal(res(r).reed, 0)
    return { house: 'stone', stonePaid: 2, reedPaid: 1 }
  })
  it("an already stone house rejects renovation before a legal action", () => {
    return denyHost(setup({ house: 'stone', resources: { stone: 3, reed: 1 } }), 'house-redevelopment')
  })
  it("three connected rooms pay three stone and one flat roof reed", () => {
    const r = renovate(setup({ rooms: 3, resources: { stone: 3, reed: 1 } }), 'stone', false)
    assert.equal(res(r).stone, 0)
    assert.equal(res(r).reed, 0)
    assert.equal(r.state.players[0]!.rooms, 3)
    return { rooms: 3, house: 'stone', stonePaid: 3, reedPaid: 1 }
  })
  it("actual renovation undo probes full restoration before a real retry", () => {
    const s = setup({ resources: { stone: 2, reed: 1 } })
    const before = undoRuleSnapshot(s.getState())
    const interactionBeforeWholeUndo = structuredClone(s.getState().interaction)
    renovate(s, 'stone', false)
    const wholeUndoResponse1 = s.undoAction()
    assertUndoRestored(before, wholeUndoResponse1)
    assert.deepEqual(wholeUndoResponse1.interaction, interactionBeforeWholeUndo)
    assert.deepEqual(s.getState().interaction, interactionBeforeWholeUndo)
    assert.equal(wholeUndoResponse1.state.currentPlayerIndex, 0)
    assert.equal(s.getState().state.currentPlayerIndex, 0)
    const r = renovate(s, 'stone', false)
    assert.equal(res(r).stone, 0)
    assert.equal(res(r).reed, 0)
    return { restored: true, retryHouse: 'stone', retryStone: 0, retryReed: 0 }
  })
  it("the opponent actual renovation cannot use the owner Conservator", () => {
    const s = setup({ configure(state) {
        Object.assign(state.players[1]!.resources, { stone: 2, reed: 1 })
      } })
    complete(turn(s, 0, 'day-laborer'), 0)
    ready(s, 1)
    assertRejectedUnchanged(s, () => s.takeAction(1, 'house-redevelopment'))
    const r = complete(turn(s, 1, 'grain-seeds'), 1)
    assert.equal(r.state.players[1]!.houseType, 'wood')
    assert.equal(res(r, 1).stone, 2)
    assert.equal(res(r, 1).reed, 1)
    return { opponentHouse: 'wood', opponentStone: 2, opponentReed: 1, foreignAbility: false, legalRetryCompleted: true }
  })
})
