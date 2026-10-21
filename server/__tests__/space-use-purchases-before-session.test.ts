import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { ActionChoiceOption, GameState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { getChoiceOptions } from './_helpers/session-assertions'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function make(card: string, resources: Partial<Resource>, round = 14, configure?: (state: GameState) => void) {
  const session = createWorkSession({ seed: 42, configure: state => {
    state.round = round
    for (const player of state.players) {
      for (const resource of Object.keys(player.resources)) Reflect.set(player.resources, resource, 0)
    }
    const owner = state.players[0]!
    if (['A138_Harpooner', 'A147_AnimalDealer', 'B166_CattleFeeder', 'C138_AnimalFeeder'].includes(card)) {
      owner.occupationPlayed = [card]
    } else {
      owner.minorPlayed = [card]
    }
    Object.assign(owner.resources, resources)
    owner.pastures = [{ id: 'pasture', tiles: [{ row: 0, col: 3 }], animalType: resources.boar ? 'boar' : null, animalCount: resources.boar ?? 0 }]
    owner.fenceSegments = ['H-0-3', 'H-1-3', 'V-0-3', 'V-0-4'].map(edge => ({ edge, type: 'fence' }))
    state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 1
    state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
    state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function offers(option: ActionChoiceOption, good: keyof Resource): boolean {
  const preview = option.effectPreview
  return preview?.kind === 'resourceMovement' ? (preview.resources[good] ?? 0) > 0
    : preview?.kind === 'resourceExchange' && (preview.resourcesGained?.[good] ?? 0) > 0
}

function finish(session: GameSession, initial: SessionResponse, good: keyof Resource, accept = true): SessionResponse {
  let response = initial
  for (let step = 0; step < 12 && response.interaction.stateId === 'wait'; step++) {
    const interaction = response.interaction
    if (interaction.request.kind === 'confirm-next-player') return response
    if (interaction.request.kind === 'animal-reorg') {
      const animal = (['sheep', 'boar', 'cattle'] as const).find(key => response.state.players[0]!.resources[key] > 0)
      const zones = interaction.request.zones.map(zone => ({ ...zone,
        animalType: zone.id === 'pasture' && animal ? animal : null,
        animalCount: zone.id === 'pasture' && animal ? response.state.players[0]!.resources[animal] : 0,
      }))
      response = session.resolveChoice(interaction.playerIndex, 'confirm', { zones })
    } else {
      const options = getChoiceOptions(response).filter(option => !option.disabled)
      const option = (!accept ? options.find(option => ['__skip__', '__pass__', '__done__'].includes(option.value)) : undefined)
        ?? options.find(option => offers(option, good))
        ?? options.find(option => !['__skip__', '__pass__', '__done__'].includes(option.value))
      expect(option, JSON.stringify(interaction)).toBeDefined()
      response = session.resolveChoice(interaction.playerIndex, option!.value)
    }
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction.stateId, JSON.stringify(response.interaction)).toBe('idle')
  return response
}

const purchases: Array<{ card: string; space: string; resources: Partial<Resource>; expected: Partial<Resource>; good: keyof Resource; round?: number }> = [
  { card: 'A147_AnimalDealer', space: 'sheep-market', resources: { food: 1 }, expected: { food: 0, sheep: 2 }, good: 'sheep' },
  { card: 'B060_BrewingWater', space: 'fishing', resources: { grain: 1 }, expected: { grain: 0, food: 1 }, good: 'food', round: 4 },
  { card: 'B166_CattleFeeder', space: 'grain-seeds', resources: { food: 1 }, expected: { food: 0, grain: 1, cattle: 1 }, good: 'cattle' },
  { card: 'C138_AnimalFeeder', space: 'day-laborer', resources: { food: 2 }, expected: { food: 2, cattle: 1 }, good: 'cattle' },
  { card: 'D039_TruffleSlicer', space: 'forest', resources: { food: 1, boar: 1 }, expected: { food: 0, boar: 1, wood: 3 }, good: 'wood' },
  { card: 'E082_Profiteering', space: 'day-laborer', resources: { wood: 1 }, expected: { wood: 0, stone: 1, food: 2 }, good: 'stone' },
]

describe('space-use purchases before their host', () => {
  it.each(purchases.filter(scenario => scenario.card !== 'C138_AnimalFeeder'))('$card can decline without paying or granting its optional effect', scenario => {
    const session = make(scenario.card, scenario.resources, scenario.round)
    const pending = session.takeAction(0, scenario.space)
    expect(getChoiceOptions(pending).some(option => option.value === '__skip__')).toBe(true)
    const response = finish(session, pending, scenario.good, false)
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === scenario.card)).toHaveLength(0)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === scenario.card)).toHaveLength(0)
    expect(response.state.futureMeeples.filter(entry => entry.cardId === scenario.card)).toHaveLength(0)
  })

  it.each(purchases.flatMap(scenario => ['hand', 'opponent', 'unrelated'].map(mode => ({ ...scenario, mode }))))('$card does not trigger for $mode', scenario => {
    const session = make(scenario.card, scenario.resources, scenario.round, state => {
      const owner = state.players[0]!
      if (scenario.mode === 'hand') {
        if (owner.occupationPlayed.includes(scenario.card)) {
          owner.occupationPlayed = []
          owner.occupationHand = [scenario.card]
        } else {
          owner.minorPlayed = []
          owner.minorHand = [scenario.card]
        }
      }
      if (scenario.mode === 'opponent') state.currentPlayerIndex = 1
    })
    const response = finish(session, session.takeAction(scenario.mode === 'opponent' ? 1 : 0,
      scenario.mode === 'unrelated' ? 'reed-bank' : scenario.space), scenario.good)
    expect(response.ok, response.error).toBe(true)
    expect(readCardResourceStats(response.state.players[0]!, scenario.card)).toBeUndefined()
    expect(response.state.events.filter(event => event.type === 'card.triggered' && event.sourceCardId === scenario.card)).toHaveLength(0)
  })

  it('C138 cannot buy cattle or boar with the food its Day Laborer host has yet to grant', () => {
    const session = make('C138_AnimalFeeder', {})
    const pending = session.takeAction(0, 'day-laborer')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources.food).toBe(0)
    expect(getChoiceOptions(pending).filter(option => !option.disabled).some(option => offers(option, 'boar') || offers(option, 'cattle'))).toBe(false)
    const response = finish(session, pending, 'grain')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, grain: 1, boar: 0, cattle: 0 })
  })

  it('A147 cannot finance an animal purchase by converting the pig its host will collect', () => {
    const session = make('A147_AnimalDealer', {}, 14, state => state.players[0]!.minorPlayed.push('E053_BoarSpear'))
    const response = finish(session, session.takeAction(0, 'pig-market'), 'food')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, boar: 0 })
    expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'A147_AnimalDealer')).toHaveLength(0)
    expect(readCardResourceStats(response.state.players[0]!, 'A147_AnimalDealer')?.gained.boar ?? 0).toBe(0)
  })

  it('A138 reed can pay a reaction within the Fishing host, with one payment again after undo', () => {
    const session = make('A138_Harpooner', { wood: 1 }, 14, state => state.players[0]!.minorPlayed.push('TEST_ReedPayment'))
    session.withCtx(() => requireActiveCardRegistry('before-purchase-spend').registerListener({
      id: 'test-reed-payment', cardIds: ['TEST_ReedPayment'], actions: ['collect'], phases: ['immediatelyAfter'],
      handler: context => context.space.id === 'fishing' && context.player.resources.reed > 0 ? { flow: { type: 'seq', children: [
        { type: 'leaf', actionId: 'pay', sourceCard: 'TEST_ReedPayment', params: { reed: 1 } },
        { type: 'leaf', actionId: 'gain', sourceCard: 'TEST_ReedPayment', params: { stone: 1 } },
      ] } } : undefined,
    }))
    const use = () => {
      const response = finish(session, session.takeAction(0, 'fishing'), 'reed')
      expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, reed: 0, stone: 1, food: 3 })
      expect(response.state.events.filter(event => event.type === 'resource.paid' && event.sourceCardId === 'A138_Harpooner')).toHaveLength(1)
    }
    use()
    expect(session.undoAction().ok).toBe(true)
    expect(session.getState().state.players[0]!.resources).toMatchObject({ wood: 1, reed: 0, stone: 0, food: 0 })
    use()
  })

  it('E053 only opens conversion after a pig acquisition and preserves older pigs', () => {
    const unrelated = make('E053_BoarSpear', { boar: 1 })
    const forest = unrelated.takeAction(0, 'forest')
    expect(forest.ok, forest.error).toBe(true)
    expect(forest.state.players[0]!.resources).toMatchObject({ boar: 1, food: 0, wood: 3 })
    expect(readCardResourceStats(forest.state.players[0]!, 'E053_BoarSpear')).toBeUndefined()
    const session = make('E053_BoarSpear', { boar: 1 })
    const pending = session.takeAction(0, 'pig-market')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.state.players[0]!.resources).toMatchObject({ boar: 2, food: 0 })
    const response = finish(session, pending, 'food')
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, food: 4 })
    const host = response.state.events.findIndex(event => event.type === 'resource.moved' && !event.sourceCardId)
    const conversion = response.state.events.findIndex(event => event.type === 'resource.exchanged' && event.exchangeSource === 'E053_BoarSpear')
    expect(host).toBeGreaterThanOrEqual(0)
    expect(conversion).toBeGreaterThan(host)
  })

  it.each(purchases)('$card pays and grants its effect before the $space host', scenario => {
    const session = make(scenario.card, scenario.resources, scenario.round)
    const pending = session.takeAction(0, scenario.space)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId === 'wait' && pending.interaction.request.kind).toBe('choice')
    expect(pending.state.events.filter(event => event.type === 'resource.moved' && !event.sourceCardId)).toHaveLength(0)
    const response = finish(session, pending, scenario.good)
    expect(response.state.players[0]!.resources).toMatchObject(scenario.expected)
    const pay = response.state.events.findIndex(event => event.type === 'resource.paid' && event.sourceCardId === scenario.card)
    const host = response.state.events.findIndex(event => event.type === 'resource.moved' && !event.sourceCardId)
    expect(pay).toBeGreaterThanOrEqual(0)
    expect(host).toBeGreaterThan(pay)
    expect(readCardResourceStats(response.state.players[0]!, scenario.card)?.used).toBe(1)
    expect(response.state.log.some(log => log.key === 'log.cardTriggered' && log.params?.cardId === scenario.card)).toBe(true)
    expect(response.scores).toHaveLength(2)
    if (scenario.card === 'B060_BrewingWater') {
      expect(response.state.futureMeeples.filter(entry => entry.cardId === scenario.card).map(entry => entry.round)).toEqual([5, 6, 7, 8, 9, 10])
    }
    if (scenario.card === 'D039_TruffleSlicer') expect(response.state.players[0]!.cardStates[scenario.card]?.counters?.bonusVp).toBe(1)
  })

  it('A138 pays wood and grants its reward before Fishing collects food', () => {
    const card = 'A138_Harpooner'
    const session = make(card, { wood: 1 })
    const pending = session.takeAction(0, 'fishing')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction.stateId === 'wait' && pending.interaction.request.kind).toBe('choice')
    expect(pending.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0, reed: 0 })
    expect(pending.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food).toBe(1)
    const response = finish(session, pending, 'reed')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 3, reed: 1 })
    const pay = response.state.events.findIndex(event => event.type === 'resource.paid' && event.sourceCardId === card)
    const host = response.state.events.findIndex(event => event.type === 'resource.moved' && !event.sourceCardId)
    expect(pay).toBeGreaterThanOrEqual(0)
    expect(host).toBeGreaterThan(pay)
    expect(readCardResourceStats(response.state.players[0]!, card)?.used).toBe(1)
    expect(response.state.log.some(log => log.key === 'log.cardTriggered' && log.params?.cardId === card)).toBe(true)
    expect(response.scores).toHaveLength(2)
  })
})
