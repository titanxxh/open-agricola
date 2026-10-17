import type { GameSession as SessionRuleOwner } from '../game/authoritative-session'
import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { setWorkersAtHome } from '../../shared/domain/player'
import { executeCardListener, getRegisteredCardListeners, type CardListenerContext } from '../../shared/cards/card-listeners'

import '../../shared/cards/A/A087_Conservator'
import '../../shared/cards/A/A088_HedgeKeeper'
import '../../shared/cards/A/A090_PlowDriver'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit11FarmFuture from './_helpers/audit/ae-negative-11-farm-future'

const CARD_ID = 'A087_Conservator'

const findListener = (ruleOwner: SessionRuleOwner | TestCardRegistry, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === id)
  return ruleOwner instanceof TestCardRegistry ? withActiveRegistry(ruleOwner, lookupRule1) : ruleOwner.withCtx(lookupRule1)
}

const setup = (
  overrides: {
    houseType?: 'wood' | 'clay' | 'stone'
    rooms?: number
    resources?: Partial<Record<string, number>>
    playA87?: boolean
  } = {},
) => {
  const session = new GameSession(42)
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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

    expect(result).toBeUndefined()
  })

  it('is silent when the player has not played A87', () => {
    const session = setup({ playA87: false })
    const state = session.getState().state
    const player = state.players[0]!
    const listener = findListener(session, 'A87-conservator-add-stone-renovation-target')!

    const result = session.withCtx(() => executeCardListener(listener, {
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'computeChoiceCandidates',
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: true,
    } as unknown as CardListenerContext))

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
      state,
      player,
      actionId: 'renovate-house',
      phase: 'isDoable',
      doable: false,
    } as unknown as CardListenerContext))

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
    expect((resp.interaction as { sourceCard?: string }).sourceCard).toBeUndefined()
    expect(resp.interaction.request.options?.find((option) => option.value === 'clay')?.sourceCard).toBeUndefined()
    expect(resp.interaction.request.options?.find((option) => option.value === 'stone')?.sourceCard).toBe(CARD_ID)
  })
})

const playOccupation = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const card = response.interaction.request.options?.find((option) => option.value === CARD_ID)
  expect(card).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, card!.value)
}

const renovate = (session: GameSession, target?: 'clay' | 'stone') => {
  let response = session.takeAction(0, 'house-redevelopment')
  if (response.interaction.stateId === 'wait'
    && response.interaction.promptKey === 'ui.interactionChooseRenovationTarget') {
    expect(target).toBeDefined()
    const option = response.interaction.request.options?.find((candidate) => candidate.value === target)
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

describe('ae-negative-11-farm-future', () => {
  const { CONS, sessions, scenario, setup, res, ready, turn, complete, lessons, renoEntry, renoFinish, renovate, denyHost, fields } = audit11FarmFuture
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  scenario('A087 N1 real first and later Lessons pay zero and one food without an immediate ability',()=>{for(const prior of[0,1]){const s=setup(CONS,{played:false,occupations:prior,resources:{food:prior},house:'stone'});const r=lessons(s,CONS);assert.equal(res(r).food,0);assert.equal(fields(r),0);assert.equal(r.state.players[0]!.fenceSegments.length,0)}return{firstFee:0,laterFee:1,immediateFields:0,immediateFences:0}})
  scenario('A087 N2 missing the later Lessons food rejects a real forged entry before a legal action',()=>{return denyHost(setup(CONS,{played:false,occupations:1}),'lessons')})
  scenario('A087 N3 direct stone renovation pays two stone and one roof reed with wood 0',()=>{const r=renovate(setup(CONS,{resources:{stone:2,reed:1,wood:0}}));assert.equal(res(r).stone,0);assert.equal(res(r).reed,0);assert.equal(res(r).wood,0);return{house:'stone',stonePaid:2,reedPaid:1,wood:0}})
  scenario('A087 N4 direct stone renovation pays two stone and one roof reed with wood 1',()=>{const r=renovate(setup(CONS,{resources:{stone:2,reed:1,wood:1}}));assert.equal(res(r).stone,0);assert.equal(res(r).reed,0);assert.equal(res(r).wood,1);return{house:'stone',stonePaid:2,reedPaid:1,wood:1}})
  scenario('A087 N5 missing stone cannot substitute wood for the direct stone fee',()=>{return denyHost(setup(CONS,{resources:{"stone": 1, "reed": 1, "wood": 10}}),'house-redevelopment')})
  scenario('A087 N6 missing reed cannot substitute wood for the direct stone fee',()=>{return denyHost(setup(CONS,{resources:{"stone": 2, "reed": 0, "wood": 10}}),'house-redevelopment')})
  scenario('A087 N7 a real renovation menu rejects an invalid wood target and a foreign OA actor before legal clay',()=>{const s=setup(CONS,{resources:{clay:2,stone:2,reed:1}});const r=renoEntry(s);assertRejectedUnchanged(s,()=>s.resolveChoice(1,'clay'));assertRejectedUnchanged(s,()=>s.resolveChoice(0,'wood'));const end=renoFinish(s,r,'clay');assert.equal(res(end).clay,0);assert.equal(res(end).stone,2);assert.equal(res(end).reed,0);return{invalidTargetRejected:true,house:'clay',stone:2,clay:0,reed:0}})
  scenario('A087 N8 both affordable paths permit choosing stone while preserving the other material',()=>{const r=renovate(setup(CONS,{resources:{clay:2,stone:2,reed:1}}),'stone');assert.equal(res(r).stone,0);assert.equal(res(r).clay,2);assert.equal(res(r).reed,0);return{house:'stone',paidMaterial:2,reedPaid:1,otherMaterial:2}})
  scenario('A087 N9 both affordable paths permit choosing clay while preserving the other material',()=>{const r=renovate(setup(CONS,{resources:{clay:2,stone:2,reed:1}}),'clay');assert.equal(res(r).clay,0);assert.equal(res(r).stone,2);assert.equal(res(r).reed,0);return{house:'clay',paidMaterial:2,reedPaid:1,otherMaterial:2}})
  scenario('A087 N10 Conservator in hand cannot enable direct stone renovation',()=>{return denyHost(setup(CONS,{played:false,resources:{stone:2,reed:1}}),'house-redevelopment')})
  scenario('A087 N11 only the opponent Conservator cannot enable direct stone renovation',()=>{return denyHost(setup(CONS,{opponent:true,resources:{stone:2,reed:1}}),'house-redevelopment')})
  scenario('A087 N12 a clay house uses ordinary stone renovation with one roof reed',()=>{const r=renovate(setup(CONS,{house:'clay',resources:{stone:2,reed:1}}));assert.equal(res(r).stone,0);assert.equal(res(r).reed,0);return{house:'stone',stonePaid:2,reedPaid:1}})
  scenario('A087 N13 an already stone house rejects renovation before a legal action',()=>{return denyHost(setup(CONS,{house:'stone',resources:{stone:3,reed:1}}),'house-redevelopment')})
  scenario('A087 N14 three connected rooms pay three stone and one flat roof reed',()=>{const r=renovate(setup(CONS,{rooms:3,resources:{stone:3,reed:1}}));assert.equal(res(r).stone,0);assert.equal(res(r).reed,0);assert.equal(r.state.players[0]!.rooms,3);return{rooms:3,house:'stone',stonePaid:3,reedPaid:1}})
  scenario('A087 N15 actual renovation undo probes full restoration before a real retry',()=>{const s=setup(CONS,{resources:{stone:2,reed:1}});const before=undoRuleSnapshot(s.getState());renovate(s);assertUndoRestored(before,s.undoAction());const r=renovate(s);assert.equal(res(r).stone,0);assert.equal(res(r).reed,0);return{restored:true,retryHouse:'stone',retryStone:0,retryReed:0}})
  scenario('A087 N16 the opponent actual renovation cannot use the owner Conservator',()=>{const s=setup(CONS,{configure(state){Object.assign(state.players[1]!.resources,{stone:2,reed:1})}});complete(turn(s,0,'day-laborer'));ready(s,1);assertRejectedUnchanged(s,()=>s.takeAction(1,'house-redevelopment'));const r=complete(turn(s,1,'grain-seeds'));assert.equal(r.state.players[1]!.houseType,'wood');assert.equal(res(r,1).stone,2);assert.equal(res(r,1).reed,1);return{opponentHouse:'wood',opponentStone:2,opponentReed:1,foreignAbility:false,legalRetryCompleted:true}})
})
