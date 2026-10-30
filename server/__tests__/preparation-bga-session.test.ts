import { afterEach, describe, expect, it } from 'vitest'
import type { ActionChoiceOption, GameState } from '../../shared/contract/types'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'

const ARTISAN = 'A096_TaskArtisan'
const BAKING_SHEET = 'A030_BakingSheet'
const NIGHTWORKER = 'C125_Nightworker'
const SCHOLAR = 'B097_Scholar'
const PLOW_DRIVER = 'A090_PlowDriver'
const NEW_PURCHASE = 'B070_NewPurchase'
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
  let response = finishRoundSix(session)
  expect(response.state.round).toBe(7)
  expect(response.state.events.filter(event => event.type === 'action.revealed'
    && event.actionId === 'western-quarry' && event.roundSlot === 7)).toHaveLength(1)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger'
    && response.interaction.request.options?.some(option => option.value === ARTISAN && !option.disabled)) {
    response = choose(session, response, ARTISAN)
  }
  return response
}

const finishExchangeSources = (session: GameSession, response: SessionResponse): SessionResponse => {
  for (let step = 0; step < 4 && response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'select-trigger'; step++) {
    const sources = response.interaction.request.options?.filter(option => !option.disabled && option.value !== '__pass__') ?? []
    if (sources.some(option => option.labelKey !== 'actions.exchange.name')) break
    const pass = response.interaction.request.options?.find(option => option.value === '__pass__' && !option.disabled)
    if (!pass) throw new Error('Expected a legal Pass after the required preparation source')
    response = choose(session, response, pass.value)
  }
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

const enterNewPurchaseWindow = ({ grain, round = 6, food = 0 }: {
  grain: number; round?: number; food?: number
}): { session: GameSession; response: SessionResponse } => {
  const session = prepare(state => {
    state.round = round
    const owner = state.players[0]!
    owner.minorHand = [NEW_PURCHASE]
    owner.resources.food = food
    owner.resources.grain = grain
  })
  let response = buy(session, session.takeAction(0, 'meeting-place'), NEW_PURCHASE)
  expect(response.state.players[0]!.minorPlayed).toEqual([NEW_PURCHASE])
  expect(response.state.players[0]!.resources).toMatchObject({ food, grain })
  expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === NEW_PURCHASE)).toHaveLength(1)
  for (const [actor, space] of [[1, 'day-laborer'], [0, 'forest'], [1, 'clay-pit']] as const) {
    response = choose(session, response, 'confirm')
    expect(response.interaction.stateId).toBe('idle')
    response = session.takeAction(actor, space)
    expect(response.ok, response.error).toBe(true)
  }
  response = choose(session, response, 'confirm')
  return { session, response }
}

const openGrainExchange = (session: GameSession, response: SessionResponse): SessionResponse => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected the retained crop purchase window')
  const exchange = response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')
  if (exchange) return choose(session, response, exchange.value)
  const next = session.takeAnytimeAction(0, 'exchange')
  expect(next.ok, next.error).toBe(true)
  return next
}

const convertGrain = (session: GameSession, response: SessionResponse, count: number): SessionResponse => {
  if (response.interaction.stateId !== 'wait') throw new Error('Expected the basic grain conversion')
  const grain = response.interaction.request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
    && (option.effectPreview.resourcesPaid?.grain ?? 0) > 0 && (option.effectPreview.resourcesGained?.food ?? 0) > 0)
  expect(grain, JSON.stringify(response.interaction)).toBeDefined()
  if (!grain) throw new Error('Basic grain conversion is unavailable')
  return choose(session, response, `bulk:${grain.value.split(':')[1]}=${count}`)
}

const isCropOffer = (option: ActionChoiceOption, crop: 'grain' | 'vegetable'): boolean => !option.disabled
  && option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained?.[crop] === 1
  && option.effectPreview.resourcesPaid?.food === (crop === 'grain' ? 2 : 4)

const purchaseCrop = (session: GameSession, response: SessionResponse, crop: 'grain' | 'vegetable'): SessionResponse => {
  const cropBefore = response.state.players[0]!.resources[crop]
  for (let step = 0; step < 3; step++) {
    if (response.interaction.stateId !== 'wait') throw new Error('The crop purchase window disappeared')
    const offer = response.interaction.request.options?.find(option => isCropOffer(option, crop))
    if (offer) expect(response.interaction.request).toMatchObject({ kind: 'choice', requiresExplicitChoice: true })
    const source = offer
      ?? response.interaction.request.options?.find(option => !option.disabled && option.sourceCard === NEW_PURCHASE)
    expect(source, JSON.stringify(response.interaction)).toBeDefined()
    if (!source) throw new Error('New Purchase source is unavailable')
    response = choose(session, response, source.value)
    if (response.state.players[0]!.resources[crop] === cropBefore + 1) return response
  }
  throw new Error('New Purchase did not buy the selected crop')
}

const finishCropWindow = (session: GameSession, response: SessionResponse): SessionResponse => {
  for (let step = 0; step < 3 && response.state.round === 6; step++) {
    if (response.interaction.stateId !== 'wait') throw new Error('Expected the remaining crop window')
    const exit = response.interaction.request.options?.find(option => !option.disabled && ['__skip__', '__done__', '__pass__'].includes(option.value))
    if (!exit) throw new Error('The optional crop window cannot finish')
    response = choose(session, response, exit.value)
  }
  return response
}

describe('BGA preparation windows', () => {
  it('does not offer a New Purchase exchange before a non-harvest round', () => {
    const { response } = enterNewPurchaseWindow({ grain: 2, round: 5 })
    expect(response.state.round).toBe(6)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 2, vegetable: 0 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === NEW_PURCHASE)).toEqual([])
    expect(response.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([])
  })

  it('keeps New Purchase crop offers available when grain can fund their nested optional payment', () => {
    const opening = enterNewPurchaseWindow({ grain: 2 })
    const session = opening.session
    let response = opening.response
    expect(response.state.round).toBe(6)
    expect(response.state.roundPhase).toBe('preparation')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 2, vegetable: 0 })
    expect(response.state.events.some(event => event.type === 'action.revealed' && event.roundSlot === 7)).toBe(false)
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('Expected New Purchase exchange before the round reveal')
    const exchange = response.interaction.request.options?.find(option => option.labelKey === 'actions.exchange.name')
    expect(exchange, JSON.stringify(response.interaction)).toBeDefined()
    expect(exchange?.disabled).not.toBe(true)
    expect(session.state.futureMeeples).toEqual([])
    response = convertGrain(session, openGrainExchange(session, response), 2)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0 })
    response = purchaseCrop(session, response, 'grain')
    response = finishCropWindow(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, vegetable: 0 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === NEW_PURCHASE)).toHaveLength(1)
    expect(readCardResourceStats(response.state.players[0]!, NEW_PURCHASE)).toMatchObject({ paid: { food: 2 }, gained: { grain: 1 } })
    expect(response.state.round).toBe(7)
    expect(response.state.roundPhase).toBe('work')
  })

  it('restores the second New Purchase crop after another exchange without replaying the first payment', () => {
    const opening = enterNewPurchaseWindow({ grain: 6 })
    const session = opening.session
    let response = convertGrain(session, openGrainExchange(session, opening.response), 2)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 4, vegetable: 0 })
    response = purchaseCrop(session, response, 'grain')
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 5, vegetable: 0 })
    expect(readCardResourceStats(response.state.players[0]!, NEW_PURCHASE)).toMatchObject({ paid: { food: 2 }, gained: { grain: 1 } })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: NEW_PURCHASE,
      request: { kind: 'choice', requiresExplicitChoice: true } })
    if (response.interaction.stateId !== 'wait') throw new Error('The second crop continuation disappeared')
    const cropHostSpace = response.interaction.spaceId
    response = openGrainExchange(session, response)
    expect(response.interaction.stateId).toBe('wait')
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    response = restored.getState()
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('The nested exchange cursor did not restore')
    const grain = response.interaction.request.options?.find(option => option.effectPreview?.kind === 'resourceExchange'
      && (option.effectPreview.resourcesPaid?.grain ?? 0) > 0)
    if (!grain) throw new Error('The nested grain conversion did not restore')
    const before = restored.getState()
    const wrongActor = restored.resolveChoice(1, `bulk:${grain.value.split(':')[1]}=4`)
    expect(wrongActor.ok).toBe(false)
    expect(wrongActor.state.players[0]!.resources).toEqual(before.state.players[0]!.resources)
    expect(wrongActor.state.events).toEqual(before.state.events)
    expect(wrongActor.interaction).toEqual(before.interaction)
    response = convertGrain(restored, restored.getState(), 4)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, grain: 1, vegetable: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: NEW_PURCHASE, spaceId: cropHostSpace,
      request: { kind: 'choice', requiresExplicitChoice: true } })
    expect(readCardResourceStats(response.state.players[0]!, NEW_PURCHASE)).toMatchObject({ paid: { food: 2 }, gained: { grain: 1 } })
    if (response.interaction.stateId !== 'wait') throw new Error('The unpaid second crop did not resume')
    expect(response.interaction.request.options?.some(option => isCropOffer(option, 'grain'))).toBe(false)
    response = purchaseCrop(restored, response, 'vegetable')
    response = finishCropWindow(restored, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, vegetable: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === NEW_PURCHASE)
      .map(event => event.type === 'resource.paid' ? event.resources.food : undefined)).toEqual([2, 4])
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === NEW_PURCHASE
      && event.reason === 'cardEffect').map(event => event.type === 'resource.moved' ? event.resources : undefined))
      .toEqual([{ grain: 1 }, { vegetable: 1 }])
    expect(readCardResourceStats(response.state.players[0]!, NEW_PURCHASE))
      .toMatchObject({ paid: { food: 6 }, gained: { grain: 1, vegetable: 1 } })
    expect(response.state.events.filter(event => event.type === 'resource.exchanged')).toHaveLength(2)
    expect(response.state.events.filter(event => event.type === 'action.revealed' && event.roundSlot === 7)).toHaveLength(1)
    expect(response.state.round).toBe(7)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
  })

  it('buys New Purchase vegetable before grain in the same BeforeStartOfTurn window', () => {
    const opening = enterNewPurchaseWindow({ grain: 0, food: 6 })
    const session = opening.session
    let response = purchaseCrop(session, opening.response, 'vegetable')
    expect(response.state.round).toBe(6)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 0, vegetable: 1 })
    expect(response.state.events.some(event => event.type === 'action.revealed' && event.roundSlot === 7)).toBe(false)
    response = purchaseCrop(session, response, 'grain')
    response = finishCropWindow(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, vegetable: 1 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === NEW_PURCHASE)
      .map(event => event.type === 'resource.paid' ? event.resources.food : undefined)).toEqual([4, 2])
    expect(response.state.events.filter(event => event.type === 'action.revealed' && event.roundSlot === 7)).toHaveLength(1)
    expect(response.state.round).toBe(7)
    expect(response.state.roundPhase).toBe('work')
    expect(response.interaction.stateId).toBe('idle')
  })

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
    response = finishCropWindow(session, response)
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
    const response = finishExchangeSources(session, buy(session, revealQuarry(session), BAKING_SHEET))
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
    for (let step = 0; step < 6 && next.interaction.stateId === 'wait'; step++) {
      if (next.interaction.request.kind === 'choice') {
        const discard = next.interaction.request.options.find((option) => option.labelKey === 'actions.discard-goods.name')
        const skip = next.interaction.request.options.find((option) => option.value === '__skip__')
        if (!discard || !skip) break
        next = choose(session, next, skip.value)
        continue
      }
      if (next.interaction.request.kind !== 'select-trigger') break
      expect(next.interaction.request.options?.some((option) => option.sourceCard === NIGHTWORKER && !option.disabled)).toBe(false)
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
    response = purchaseCrop(session, response, 'grain')
    response = finishCropWindow(session, response)
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
    const response = finishExchangeSources(restored, buy(restored, restored.getState(), BAKING_SHEET))
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
