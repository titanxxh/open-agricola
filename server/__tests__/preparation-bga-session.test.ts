import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'

const ARTISAN = 'A096_TaskArtisan'
const BAKING_SHEET = 'A030_BakingSheet'
const NIGHTWORKER = 'C125_Nightworker'
const SCHOLAR = 'B097_Scholar'
const PLOW_DRIVER = 'A090_PlowDriver'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// #1145: a new two-player work fixture advances round 6 through real placements.
// Quarry reactions, purchases and subsequent preparation windows are observed
// through GameSession responses, including the authoritative event history.
const prepare = (configure: (state: GameState) => void): GameSession => {
  const session = createWorkSession({
    seed: 4242,
    configure(state) {
      state.round = 6
      state.roundActionOrder[6] = 'western-quarry'
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        Object.assign(player.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0 })
      }
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

const choose = (session: GameSession, response: SessionResponse, value: string): SessionResponse => {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected a preparation choice')
  const actor = response.interaction.request.kind === 'confirm-next-player'
    ? response.interaction.request.fromPlayerIndex
    : response.interaction.playerIndex
  const next = session.resolveChoice(actor, value)
  expect(next.ok, next.error).toBe(true)
  return next
}

const finishRoundSix = (session: GameSession): SessionResponse => {
  let response = session.getState()
  for (const [actor, space] of [[0, 'grain-seeds'], [1, 'reed-bank'], [0, 'day-laborer'], [1, 'clay-pit']] as const) {
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
      response = choose(session, response, 'confirm')
    }
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(actor, space)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-next-player') {
    response = choose(session, response, 'confirm')
  }
  return response
}

const revealQuarry = (session: GameSession): SessionResponse => {
  const response = finishRoundSix(session)
  expect(response.state.round).toBe(7)
  expect(response.state.events.filter(event => event.type === 'action.revealed'
    && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
  return response
}

const buy = (session: GameSession, response: SessionResponse, cardId: string): SessionResponse => {
  for (let step = 0; step < 5; step += 1) {
    if (response.state.players[0]!.minorPlayed.includes(cardId)) return response
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected an improvement offer')
    const options = response.interaction.request.options ?? []
    const option = options.find(candidate => candidate.value === cardId)
      ?? options.find(candidate => !candidate.disabled && !['__skip__', '__pass__', '__done__'].includes(candidate.value))
    expect(option).toBeDefined()
    if (!option) throw new Error('No legal improvement choice')
    response = choose(session, response, option.value)
  }
  throw new Error('Improvement purchase did not complete')
}

describe('BGA preparation windows', () => {
  it('reveals and accumulates round one once through the real setup lifecycle', () => {
    const session = createOpeningSession({
      seed: 4242, options: { deckIds: ['A'] },
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
    })
    sessions.push(session)
    const response = session.getState()
    expect(response.state.round).toBe(1)
    expect(response.state.events.filter(event => event.type === 'action.revealed' && event.roundSlot === 1)).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'round.started')).toHaveLength(1)
    expect(response.state.events.filter(event => event.type === 'action.accumulated' && event.spaceId === 'forest')).toHaveLength(1)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    expect(restored.state.events).toEqual(response.state.events)
    expect(restored.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
  })

  it('finishes BeforeStartOfTurn before increasing the round and revealing the card', () => {
    const session = prepare(state => { state.players[0]!.minorPlayed = ['B070_NewPurchase'] })
    let response = finishRoundSix(session)
    expect(response.state.round).toBe(6)
    expect(response.state.events.some(event => event.type === 'action.revealed' && event.roundSlot === 7)).toBe(false)
    response = choose(session, response, '__skip__')
    response = choose(session, response, '__skip__')
    expect(response.state.round).toBe(7)
    expect(response.state.events.filter(event => event.type === 'action.revealed' && event.roundSlot === 7)).toHaveLength(1)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
  })

  it('resumes the same Quarry reaction after buying a minor improvement', () => {
    const session = prepare(state => {
      state.players[0]!.occupationPlayed = [ARTISAN]
      state.players[0]!.minorHand = [BAKING_SHEET]
    })
    const response = buy(session, revealQuarry(session), BAKING_SHEET)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.players[0]!.minorPlayed).toEqual([BAKING_SHEET])
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === BAKING_SHEET)).toHaveLength(1)
  })

  it('settles the Quarry reward before accumulation and Nightworker admission', () => {
    const session = prepare(state => {
      state.players[0]!.occupationPlayed = [ARTISAN, NIGHTWORKER]
      state.players[0]!.minorHand = [BAKING_SHEET]
      Object.assign(state.players[0]!.resources, { clay: 1, reed: 1, stone: 1 })
    })
    const response = revealQuarry(session)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(3)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the Quarry improvement offer')
    expect(response.interaction.sourceCard).toBe(ARTISAN)
    let next = choose(session, response, '__skip__')
    if (next.interaction.stateId === 'wait' && next.interaction.request.kind === 'select-trigger') {
      expect(next.interaction.request.options?.some(option => option.sourceCard === NIGHTWORKER && !option.disabled)).toBe(false)
      next = choose(session, next, '__pass__')
    }
    expect(next.state.roundPhase).toBe('work')
    expect(next.interaction.stateId).toBe('idle')
    expect(next.state.actionSpaces.find(space => space.id === 'forest')!.resources.wood).toBe(6)
  })

  it('lets Scholar act before receiving scheduled food in the same StartOfTurn window', () => {
    const session = prepare(state => {
      const player = state.players[0]!
      player.houseType = 'stone'
      player.occupationPlayed = [SCHOLAR]
      player.occupationHand = [ARTISAN]
      state.futureMeeples.push({
        id: 'well-food-7', cardId: 'well', playerId: player.id, round: 7,
        resources: { food: 3 }, actionId: 'receive',
      })
    })
    let response = revealQuarry(session)
    expect(response.state.players[0]!.resources.food).toBe(42)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the StartOfTurn ordering choice')
    expect(response.interaction.request.kind).toBe('select-trigger')
    expect(response.interaction.request.options?.some(option => option.value === SCHOLAR)).toBe(true)
    response = choose(session, response, SCHOLAR)
    for (let step = 0; step < 4 && !response.state.players[0]!.occupationPlayed.includes(ARTISAN); step += 1) {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected the Scholar play choice')
      const options = response.interaction.request.options ?? []
      const option = options.find(candidate => candidate.value === ARTISAN)
        ?? options.find(candidate => !candidate.disabled && !['__skip__', '__pass__', '__done__'].includes(candidate.value))
      if (!option) throw new Error('Scholar did not offer Task Artisan')
      response = choose(session, response, option.value)
    }
    expect(response.state.players[0]!.occupationPlayed).toContain(ARTISAN)
    for (let step = 0; step < 4 && response.interaction.stateId === 'wait'; step += 1) {
      const option = response.interaction.request.options?.find(candidate => candidate.labelKey === 'actions.receive.name')
        ?? response.interaction.request.options?.find(candidate => candidate.value === '__pass__')
      if (!option) break
      response = choose(session, response, option.value)
    }
    expect(response.state.players[0]!.resources.food).toBe(44)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.moved'
      && event.reason === 'receive' && event.sourceCardId === 'well')).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
  })

  it('retains a stone-house Plow Driver opportunity until scheduled food is received', () => {
    const session = prepare(state => {
      const player = state.players[0]!
      player.houseType = 'stone'
      player.resources.food = 0
      player.occupationPlayed = [PLOW_DRIVER]
      player.minorPlayed = ['B070_NewPurchase']
      state.futureMeeples.push({ id: 'well-food-7', cardId: 'well', playerId: player.id,
        round: 7, resources: { food: 1 }, actionId: 'receive' })
    })
    let response = finishRoundSix(session)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected New Purchase before round 7')
    const use = response.interaction.request.options?.find(option => !option.disabled && option.value !== '__skip__')
    if (!use) throw new Error('Expected the affordable grain exchange')
    response = choose(session, response, use.value)
    if (response.state.round === 6) response = choose(session, response, '__skip__')
    expect(response.state.round).toBe(7)
    expect(response.state.players[0]!.resources.food).toBe(0)
    response = choose(session, response, 'well')
    expect(response.state.players[0]!.resources.food).toBe(1)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Plow Driver after receiving food')
    const plow = response.interaction.request.options?.find(option => !option.disabled && option.value !== '__skip__')
    if (!plow) throw new Error('Expected the Plow Driver opportunity')
    response = choose(session, response, plow.value)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the plow selection')
    expect(response.interaction.request.kind).toBe('farm-select')
    const request = response.interaction.request
    if (request.kind !== 'farm-select' || request.farm.farmType !== 'plow') throw new Error('Expected a plow farm request')
    response = session.commitSelectionChoice(response.interaction.playerIndex, { tile: request.farm.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = choose(session, response, '__pass__')
    }
    expect(response.state.roundPhase).toBe('work')
  })

  it('restores a paused reveal purchase without repeating its reward or accumulation', () => {
    const session = prepare(state => {
      state.players[0]!.occupationPlayed = [ARTISAN]
      state.players[0]!.minorHand = [BAKING_SHEET]
    })
    revealQuarry(session)
    const snapshot = serializeSessionSnapshot(session.state, session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
    sessions.push(restored)
    const response = buy(restored, restored.getState(), BAKING_SHEET)
    expect(response.state.players[0]!.resources.wood).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'western-quarry')!.resources.stone).toBe(1)
    expect(response.state.events.filter(event => event.type === 'action.revealed' && event.roundSlot === 7)).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
  })

  it('counts one scheduled sheep once in Breed Registry when its receive leaf commits', () => {
    const session = prepare(state => {
      const player = state.players[0]!
      player.minorPlayed = ['D036_BreedRegistry']
      state.futureMeeples.push({ id: 'scheduled-sheep-7', cardId: 'C081_CaseBuilder', playerId: player.id,
        round: 7, resources: { sheep: 1 }, actionId: 'receive' })
    })
    let response = revealQuarry(session)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
      response = session.resolveChoice(response.interaction.playerIndex, 'confirm', response.interaction.request.zones)
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[0]!.cardStates.D036_BreedRegistry?.extraData?.cardSheep).toBe(1)
    expect(response.state.players[0]!.cardStates.D036_BreedRegistry?.infobox).toBe('1 / 2')
    expect(response.state.events.filter(event => event.type === 'futureMeeple.resolved' && event.cardId === 'C081_CaseBuilder')).toHaveLength(1)
  })
  it('lets a native Plow Driver source exchange grain before payment without a future action token', () => {
    const session = prepare(state => {
      for (const player of state.players) markAllWorkersUsed(state, player)
      const owner = state.players[0]!
      owner.houseType = 'stone'
      owner.occupationPlayed = [PLOW_DRIVER]
      owner.resources.food = 0
      owner.resources.grain = 1
    })
    expect(session.state.futureMeeples).toEqual([])
    let response = session.performRoundEnd()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.round).toBe(7)
    expect(response.state.roundPhase).toBe('preparation')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1 })
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the live StartOfTurn source window')
    const exchange = response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    expect(exchange?.disabled).not.toBe(true)
    response = choose(session, response, exchange!.value)
    if (response.interaction.stateId !== 'wait') throw new Error('Expected a legal grain conversion')
    const grain = response.interaction.request.options?.find(option =>
      option.effectPreview?.kind === 'resourceExchange'
        && option.effectPreview.resourcesPaid?.grain === 1
        && option.effectPreview.resourcesGained?.food === 1)
    expect(grain, JSON.stringify(response.interaction)).toBeDefined()
    response = choose(session, response, grain!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, grain: 0 })
    for (let step = 0; step < 4; step++) {
      if (response.interaction.stateId !== 'wait') throw new Error('Expected Plow Driver before work')
      if (response.interaction.request.kind === 'farm-select') break
      const plow = response.interaction.request.options?.find(option => option.value === PLOW_DRIVER)
        ?? response.interaction.request.options?.find(option => !option.disabled && option.value !== '__skip__' && option.value !== '__pass__')
      expect(plow, JSON.stringify(response.interaction)).toBeDefined()
      response = choose(session, response, plow!.value)
    }
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select'
      || response.interaction.request.farm.farmType !== 'plow') throw new Error('Expected paid Plow Driver farm selection')
    expect(response.state.players[0]!.resources.food).toBe(0)
    response = session.commitSelectionChoice(response.interaction.playerIndex, {
      tile: response.interaction.request.farm.selectableTiles[0]!,
    })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
    expect(response.state.futureMeeples).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.exchanged'
      && event.paid.grain === 1 && event.gained.food === 1)).toHaveLength(1)
    expect(response.state.roundPhase).toBe('work')
  })

})
