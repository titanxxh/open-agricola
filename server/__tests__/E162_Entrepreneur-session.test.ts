import { descriptionEffects } from './_helpers/choice-description'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { getCardStack, pushToCardStack } from '../../shared/cards/helpers/card-state'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'

import '../../shared/cards/E/E162_Entrepreneur'
import assert from 'node:assert/strict'
import * as audit57Phase from './_helpers/audit/ae-negative-57-phase'

const CARD_ID = 'E162_Entrepreneur'
const FILLER = '__test_placeholder__'

const setup = ({
  played = true, food = 1, storedFood = 0, resources = {},
}: {
  played?: boolean
  food?: number
  storedFood?: number
  resources?: Partial<{ wood: number; clay: number; reed: number; stone: number }>
} = {}) => {
  const session = new GameSession(7162, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  state.roundPhase = 'work'
  state.availableMajorImprovements = []
  state.players.forEach((player) => {
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
    player.minorPlayed = []
    player.occupationPlayed = []
    player.improvements = []
    player.cardStates = {}
    Object.assign(player.resources, {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 20, grain: 0, vegetable: 0,
      sheep: 0, boar: 0, cattle: 0, begging: 0,
    })
    setWorkersAtHome(state, player, 2)
  })
  const owner = state.players[0]!
  owner.occupationHand = played ? [FILLER] : [CARD_ID]
  owner.occupationPlayed = played ? [CARD_ID] : []
  Object.assign(owner.resources, { food, ...resources })
  if (storedFood > 0) pushToCardStack(owner, CARD_ID, Array(storedFood).fill('food'))
  session.loadState(state)
  return session
}

const optionsOf = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? response.interaction.request.options ?? []
  : []

const playEntrepreneur = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const option = optionsOf(response).find((candidate) => candidate.value === CARD_ID)
  expect(option, JSON.stringify(response.interaction, null, 2)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

const startNextRound = (session: GameSession) => {
  const state = session.getState().state
  state.players.forEach((player) => markAllWorkersUsed(state, player))
  session.loadState(state)
  return session.performRoundEnd()
}

const resolveEntrepreneur = (
  session: GameSession,
  initial: SessionResponse,
  mode: 'store' | 'discard' | 'pass',
  resource: 'wood' | 'stone' = 'wood',
) => {
  let response = initial
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait'; step++) {
    const options = optionsOf(response)
    const cardOptions = options.filter((option) => option.sourceCard === CARD_ID)
    if (mode === 'pass') {
      const skip = options.find((option) => option.value === '__skip__' || option.value === '__pass__')
      if (!skip) break
      response = session.resolveChoice(response.interaction.playerIndex, skip.value)
      break
    }
    const preferred = options.find((option) => option.effectPreview?.resourcesGained?.[resource] === 1)
      ?? options.find((option) =>
      option.sourceCard === CARD_ID && (mode === 'discard'
        ? descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'cardStack' && effect.amount === -1)
        : !descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'cardStack' && effect.amount === -1) && option.value !== '__skip__'),
    )
    const option = preferred
      ?? cardOptions.find((candidate) => candidate.value !== '__skip__')
      ?? options.find((candidate) => candidate.value !== '__skip__' && candidate.value !== '__pass__')
    if (!option) break
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  return response
}

describe('E162 Entrepreneur parity', () => {
  it('E162 S1: Entrepreneur can be played as the first occupation in a two-player game', () => {
    const response = playEntrepreneur(setup({ played: false, food: 0 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('E162 S2: storing food lets the player choose a missing resource', () => {
    const session = setup({ food: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'store', 'stone')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 0, clay: 0, reed: 0, stone: 1,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food'])
  })

  it('E162 S3: discarding stored food grants the chosen resource without returning food', () => {
    const session = setup({ food: 0, storedFood: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'discard')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({
      food: 0, wood: 1, clay: 0, reed: 0, stone: 0,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
  })

  it('E162 S4: when both food sources exist the player may discard the stored food', () => {
    const session = setup({ food: 1, storedFood: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'discard')

    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1 })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
  })

  it('restores a pending resource choice and undoes discarding stored food', () => {
    const session = setup({ food: 1, storedFood: 1, resources: { clay: 1, reed: 1 } })
    let offered = startNextRound(session)
    let discard = optionsOf(offered).find((option) => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'cardStack' && effect.amount === -1))
    if (!discard) {
      const source = optionsOf(offered).find(option => !option.disabled && option.sourceCard === CARD_ID)
      if (!source) throw new Error('Entrepreneur is not a round-start source')
      offered = session.resolveChoice(0, source.value)
      expect(offered.ok, offered.error).toBe(true)
      discard = optionsOf(offered).find((option) => descriptionEffects(option.descriptionPreview).some(effect => effect.kind === 'cardStack' && effect.amount === -1))
    }
    expect(discard, JSON.stringify(offered.interaction)).toBeDefined()
    const pending = session.resolveChoice(0, discard!.value)
    expect(getCardStack(pending.state.players[0]!, CARD_ID)).toEqual([])
    expect(pending.state.players[0]!.resources.food).toBe(1)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))

    const undone = session.undoStep(0)
    expect(undone.ok, undone.error).toBe(true)
    expect(getCardStack(undone.state.players[0]!, CARD_ID)).toEqual(['food'])
    expect(undone.state.players[0]!.resources.food).toBe(1)

    const response = resolveEntrepreneur(restored, restored.getState(), 'discard', 'stone')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, stone: 1 })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
  })

  it('E162 S5: the round-start action may be declined', () => {
    const session = setup({ food: 1, storedFood: 1 })

    const response = resolveEntrepreneur(session, startNextRound(session), 'pass')

    expect(response.state.players[0]!.resources).toMatchObject({
      food: 1, wood: 0, clay: 0, reed: 0, stone: 0,
    })
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food'])
  })

  it('E162 S6: owning all four building-resource types suppresses the round-start action', () => {
    const session = setup({
      food: 1, storedFood: 1, resources: { wood: 1, clay: 1, reed: 1, stone: 1 },
    })

    const response = startNextRound(session)

    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual(['food'])
  })

  it('E162 S7: without food in either place no Entrepreneur prompt is shown', () => {
    const response = startNextRound(setup({ food: 0 }))

    expect(optionsOf(response).some((option) => option.sourceCard === CARD_ID)).toBe(false)
    expect(response.state.players[0]!.resources).toMatchObject({
      wood: 0, clay: 0, reed: 0, stone: 0,
    })
  })

  it('does not acquire StartOfTurn eligibility after Scholar spends the last clay', () => {
    // E162 requires four players. Real placements finish round five; Scholar
    // consumes clay in the same window whose source eligibility is captured.
    const session = createWorkSession({
      seed: 7162,
      options: { playerCount: 4 },
      configure(state) {
        state.round = 5
        state.availableMajorImprovements = []
        for (const player of state.players) {
          player.minorHand = [FILLER]
          player.occupationHand = [FILLER]
          Object.assign(player.resources, { food: 20, wood: 0, clay: 0, reed: 0, stone: 0 })
        }
        const owner = state.players[0]!
        owner.houseType = 'stone'
        owner.occupationPlayed = [CARD_ID, 'B097_Scholar']
        owner.minorHand = ['A050_MilkJug']
        Object.assign(owner.resources, { wood: 1, clay: 1, reed: 1, stone: 1 })
      },
    })
    const choose = (response: SessionResponse, value: string): SessionResponse => {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected a round-start choice')
      const actor = response.interaction.request.kind === 'confirm-next-player'
        ? response.interaction.request.fromPlayerIndex
        : response.interaction.playerIndex
      const next = session.resolveChoice(actor, value)
      expect(next.ok, next.error).toBe(true)
      return next
    }
    try {
      let response = session.getState()
      for (const [actor, space] of [
        [0, 'forest'], [1, 'clay-pit'], [2, 'reed-bank'], [3, 'fishing'],
        [0, 'grain-seeds'], [1, 'day-laborer'], [2, 'grove'], [3, 'copse'],
      ] as const) {
        if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
          response = choose(response, 'confirm')
        }
        expect(response.interaction.stateId).toBe('idle')
        response = session.takeAction(actor, space)
        expect(response.ok, response.error).toBe(true)
      }
      if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
        response = choose(response, 'confirm')
      }
      expect(response.state.round).toBe(6)
      expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, reed: 1, stone: 1 })
      for (let step = 0; step < 5 && !response.state.players[0]!.minorPlayed.includes('A050_MilkJug'); step += 1) {
        const options = optionsOf(response)
        const option = options.find(candidate => candidate.value === 'B097_Scholar')
          ?? options.find(candidate => candidate.value === 'A050_MilkJug')
          ?? options.find(candidate => !candidate.disabled && !['__skip__', '__pass__', '__done__'].includes(candidate.value))
        if (!option) throw new Error('Scholar did not offer Milk Jug')
        response = choose(response, option.value)
      }
      expect(response.state.players[0]!.minorPlayed).toContain('A050_MilkJug')
      expect(response.state.players[0]!.resources).toMatchObject({ food: 20, clay: 0 })
      expect(optionsOf(response).some(option => !option.disabled && option.sourceCard === CARD_ID)).toBe(false)
      expect(getCardStack(response.state.players[0]!, CARD_ID)).toEqual([])
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toEqual([])
      expect(response.state.roundPhase).toBe('work')
      expect(response.interaction.stateId).toBe('idle')
    } finally {
      session.dispose()
    }
  })
})

describe('ae-negative-57-phase', () => {
  const { sessions, ok, save, make, finish, transition } = audit57Phase
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
  it('E162 N1 actual successive round starts store one food and gain exactly one currently missing building resource each time', () => {
    const session = make('E162_Entrepreneur')
    const first = transition(session, 6, true)
    assert.equal(first.state.players[0]!.resources.wood, 1); assert.equal(first.state.players[0]!.cardStates.E162_Entrepreneur?.stack?.length, 1)
    const next = transition(session, 7, true)
    assert.equal(next.state.players[0]!.cardStates.E162_Entrepreneur?.stack?.length, 2)
    assert.equal(next.state.players[0]!.resources.reed, 1)
    save('E162-N1', { first, next })
  })
  it('E162 N3 stored food is actually discarded at next round start to gain one missing wood without paying supply food', () => {
    const session = make('E162_Entrepreneur', state => { state.players[0]!.resources.food = 0; state.players[0]!.cardStates.E162_Entrepreneur = { stack: ['food'] } })
    const response = transition(session, 6, true)
    assert.equal(response.state.players[0]!.cardStates.E162_Entrepreneur?.stack?.length, 0)
    assert.equal(response.state.players[0]!.resources.food, 0)
    assert.equal(response.state.players[0]!.resources.wood, 1)
    save('E162-N3', response)
  })
  it('E162 N4 actual unrelated midround placement and card only in hand never store discard or gain building resources early', () => {
    const session = make('E162_Entrepreneur', state => { state.players[0]!.cardStates.E162_Entrepreneur = { stack: ['food'] } }), response = finish(session, ok(session.takeAction(0, 'grain-seeds')))
    assert.equal(response.state.players[0]!.cardStates.E162_Entrepreneur?.stack?.length, 1); assert.equal(response.state.players[0]!.resources.wood, 0); assert.equal(response.state.players[0]!.resources.food, 100)
    const hand = make('E162_Entrepreneur', undefined, false), next = transition(hand, 6, true)
    assert.equal(next.state.players[0]!.cardStates.E162_Entrepreneur?.stack?.length ?? 0, 0); assert.equal(next.state.players[0]!.resources.wood, 0)
    save('E162-N4', { response, next })
  })
  it('E162 N2 all building types already owned no payment available and optional decline each produce no new building resource', () => {
    for (const mode of ['all', 'food', 'decline']) {
      const session = make('E162_Entrepreneur', state => { if (mode === 'all') Object.assign(state.players[0]!.resources, { wood: 1, clay: 1, reed: 1, stone: 1 }); if (mode === 'food') state.players[0]!.resources.food = 0 })
      const response = transition(session, 6, mode !== 'decline')
      assert.equal(response.state.players[0]!.cardStates.E162_Entrepreneur?.stack?.length ?? 0, 0)
      assert.equal(response.state.players[0]!.resources.stone, mode === 'all' ? 1 : 0)
      save(`E162-N2-${mode}`, response)
    }
  })
})
