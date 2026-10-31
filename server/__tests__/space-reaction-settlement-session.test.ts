import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameState } from '../../shared/contract/types'
import type { CardListenerRegistration } from '../../shared/cards/card-listeners'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { workersAvailable } from '../../shared/domain/player'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'
import { createSeasonActionSpaces } from '../../shared/seasons/action-spaces'

const HAT = 'C052_HuntsmansHat'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function opening(configure: (state: GameState) => void, playerCount = 2) {
  const session = createWorkSession({ seed: 42, options: { playerCount }, configure: state => {
    state.round = 10
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      for (const key of Object.keys(player.resources)) Reflect.set(player.resources, key, 0)
    }
    for (const space of state.actionSpaces) space.takenBy = []
    configure(state)
  } })
  sessions.push(session)
  return session
}

function options(response: SessionResponse) {
  return response.interaction.stateId === 'wait' ? response.interaction.request.options ?? [] : []
}

function choose(session: GameSession, response: SessionResponse, value: string) {
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') throw new Error('Expected interaction')
  const result = session.resolveChoice(response.interaction.playerIndex, value)
  expect(result.ok, result.error).toBe(true)
  return result
}

function animals(session: GameSession, response: SessionResponse) {
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
    response = session.resolveChoice(response.interaction.playerIndex, 'confirm', { zones: response.interaction.request.zones })
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

function restore(session: GameSession) {
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  return restored
}

function accept(session: GameSession, response: SessionResponse, card: string) {
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const trigger = options(response).find(option => option.sourceCard === card)
    expect(trigger, JSON.stringify(response.interaction)).toBeDefined()
    response = choose(session, response, trigger!.value)
  }
  expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard, JSON.stringify(response.interaction)).toBe(card)
  const option = options(response).find(option => !option.disabled && option.value !== '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return choose(session, response, option!.value)
}

function listeners(session: GameSession, registrations: CardListenerRegistration[]) {
  session.state.players[0]!.minorPlayed.push(...registrations.flatMap(registration => registration.cardIds ?? []))
  session.withCtx(() => registrations.forEach(registration => requireActiveCardRegistry('space-settlement-test').registerListener(registration)))
}

describe('space reaction settlement', () => {
  it('lets the owner order space and placement before reactions in one window', () => {
    const session = opening(state => { state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3 })
    listeners(session, [
      { id: 'first-space', cardIds: ['TEST_Space'], actionSpaces: ['forest'], phases: ['before'], handler: () => ({
        sourceCard: 'TEST_Space',
        flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } },
      }) },
      { id: 'second-placement', cardIds: ['TEST_Placement'], actions: ['place-farmer'], phases: ['before'], handler: () => ({
        sourceCard: 'TEST_Placement',
        flow: { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
      }) },
    ])
    let response = session.takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('select-trigger')
    expect(options(response).filter(option => option.sourceCard).map(option => option.sourceCard)).toEqual(['TEST_Space', 'TEST_Placement'])
    response = choose(session, response, 'TEST_Placement')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 1, food: 0 })
    response = choose(session, response, 'TEST_Space')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, clay: 1, food: 1 })
    expect(response.state.events.filter(event => event.type === 'card.triggered').map(event => event.sourceCardId)).toEqual(['TEST_Placement', 'TEST_Space'])
    expect(response.state.log.filter(entry => entry.key === 'log.cardTriggered')).toHaveLength(2)
    expect(response.scores).toHaveLength(2)
  })

  it('reevaluates a dormant before source after its sibling supplies food, including restore', () => {
    let session = opening(state => { state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3 })
    const registrations: CardListenerRegistration[] = [
      { id: 'a-pay', cardIds: ['TEST_Pay'], actionSpaces: ['forest'], phases: ['before'], handler: context => {
        if (context.player.resources.food < 1) return
        return { sourceCard: 'TEST_Pay', flow: { type: 'seq', children: [
          { type: 'leaf', actionId: 'pay', params: { cost: { food: 1 } } },
          { type: 'leaf', actionId: 'gain', params: { clay: 1 } },
        ] } }
      } },
      { id: 'b-food', cardIds: ['TEST_Food'], actionSpaces: ['forest'], phases: ['before'], handler: () => ({
        sourceCard: 'TEST_Food',
        flow: { type: 'leaf', actionId: 'gain', optional: true, params: { food: 1 } },
      }) },
    ]
    listeners(session, registrations)
    let response = session.takeAction(0, 'forest')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('select-trigger')
    response = choose(session, response, 'TEST_Food')
    response = choose(session, response, options(response).find(option => option.value !== '__skip__')!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1 })
    const interaction = structuredClone(response.interaction)
    session = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(session)
    session.withCtx(() => registrations.forEach(registration => requireActiveCardRegistry('space-settlement-restore').registerListener(registration)))
    expect(session.getState().interaction).toEqual(interaction)
    response = choose(session, session.getState(), 'TEST_Pay')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0, clay: 1 })
    expect(readCardResourceStats(response.state.players[0]!, 'TEST_Food').used).toBe(1)
    expect(readCardResourceStats(response.state.players[0]!, 'TEST_Pay').used).toBe(1)
  })

  it.each([false, true])('lets the owner order Hat and Sidekick in one window, Sidekick first=%s', sidekickFirst => {
    let session = opening(state => {
      state.round = 9
      state.roundActionOrder[7] = 'vegetable-seeds'
      state.roundActionOrder[8] = 'pig-market'
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.occupationPlayed = ['A171_Sidekick']
      player.improvements = ['Major_Fireplace1']
      player.resources.food = sidekickFirst ? 1 : 0
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
    }, 5)
    let response = animals(session, session.takeAction(0, 'pig-market'))
    expect(response.state.players[0]!.resources.food).toBe(sidekickFirst ? 1 : 0)
    expect(options(response).map(option => option.sourceCard)).toContain(HAT)
    if (sidekickFirst) {
      expect(options(response).map(option => option.sourceCard)).toContain('A171_Sidekick')
      response = animals(session, accept(session, response, 'A171_Sidekick'))
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1 })
      response = choose(session, response, HAT)
    } else {
      expect(options(response).map(option => option.sourceCard)).not.toContain('A171_Sidekick')
      response = choose(session, response, HAT)
      expect(response.state.players[0]!.resources.food).toBe(1)
      expect(options(response).map(option => option.sourceCard)).toContain('A171_Sidekick')
      session = restore(session)
      response = animals(session, accept(session, session.getState(), 'A171_Sidekick'))
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: sidekickFirst ? 1 : 0, boar: 1, vegetable: 1 })
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(0)
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(1)
    expect(response.state.events.filter(event => event.type === 'card.triggered' &&
      (event.sourceCardId === HAT || event.sourceCardId === 'A171_Sidekick')).map(event => event.sourceCardId))
      .toEqual(sidekickFirst ? ['A171_Sidekick', HAT] : [HAT, 'A171_Sidekick'])
    expect(response.state.log.some(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === HAT)).toBe(true)
    expect(response.scores).toHaveLength(5)
  })

  it('credits Collector goods selected after entering a card-provided space to that space', () => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.occupationPlayed = ['C104_Collector']
      player.improvements = ['Major_Fireplace1']
      state.actionSpaces.push(...createPlayerActionSpaces(state))
    })
    let response = session.takeAction(0, 'C104_Collector')
    expect(response.ok, response.error).toBe(true)
    response = animals(session, choose(session, response, 'wood,clay,reed,stone,grain,boar'))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, boar: 1, begging: 1 })
    expect(response.state.events.find(event => event.type === 'resource.moved' && event.resources.boar === 1)).toMatchObject({
      from: { kind: 'actionSpace', spaceId: 'C104_Collector' }, sourceCardId: 'C104_Collector',
    })
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(1)
    expect(response.state.log.some(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === HAT)).toBe(true)
    expect(response.scores).toHaveLength(2)
  })

  it.each([
    [HAT, 'E053_BoarSpear', 'C025_SteamMachine'],
    ['C025_SteamMachine', HAT, 'E053_BoarSpear'],
    ['E053_BoarSpear', 'C025_SteamMachine', HAT],
  ])('lets the owner choose the Hat, Spear and Steam Machine order: %j, %j, %j', (...order) => {
    let session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT, 'E053_BoarSpear', 'C025_SteamMachine']
      player.improvements = ['Major_Fireplace1']
      player.resources.grain = 1
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: player.workers[1]!.id }]
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
    })
    let response = animals(session, session.takeAction(0, 'pig-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, boar: 1 })
    expect(options(response).filter(option => option.sourceCard).map(option => option.sourceCard))
      .toEqual(expect.arrayContaining([HAT, 'E053_BoarSpear', 'C025_SteamMachine']))
    session = restore(session)
    response = session.getState()
    for (const card of order) {
      if (card === HAT) response = choose(session, response, HAT)
      else if (card === 'E053_BoarSpear') {
        response = accept(session, response, card)
        const trade = options(response).find(option => option.value.startsWith('trade:'))
        expect(trade).toBeDefined()
        session = restore(session)
        response = animals(session, choose(session, session.getState(), trade!.value))
      } else response = accept(session, response, card)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 7, grain: 0, boar: 0 })
    expect(response.state.events.filter(event => event.type === 'card.triggered' &&
      order.includes(event.sourceCardId ?? '')).map(event => event.sourceCardId)).toEqual(order)
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(1)
    expect(response.scores).toHaveLength(2)
  })

  it.each([false, true])('lets the owner order exchange-acquired Spear conversion with another immediate reaction, Spear first=%s', spearFirst => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = ['E053_BoarSpear']
      player.occupationPlayed = ['B104_SheepWalker']
      player.resources.sheep = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
    })
    listeners(session, [{
      id: 'test-exchange-pig', cardIds: ['TEST_ExchangePig'], actions: ['exchange'], phases: ['immediatelyAfter'],
      handler: context => context.actionEvents?.some(event => event.type === 'resource.exchanged' && event.gained.boar === 1)
        ? { sourceCard: 'TEST_ExchangePig', flow: { type: 'leaf', actionId: 'gain', params: { clay: 1 } } } : undefined,
    }])
    let response = session.takeAnytimeAction(0, 'exchange')
    expect(response.ok, response.error).toBe(true)
    const sheep = options(response).find(option => option.effectPreview?.kind === 'resourceExchange' &&
      option.effectPreview.resourcesPaid?.sheep === 1 && option.effectPreview.resourcesGained?.boar === 1)
    expect(sheep).toBeDefined()
    response = animals(session, choose(session, response, sheep!.value))
    expect(options(response).filter(option => option.sourceCard).map(option => option.sourceCard))
      .toEqual(expect.arrayContaining(['E053_BoarSpear', 'TEST_ExchangePig']))
    const order = spearFirst ? ['E053_BoarSpear', 'TEST_ExchangePig'] : ['TEST_ExchangePig', 'E053_BoarSpear']
    for (const card of order) {
      if (card === 'TEST_ExchangePig') response = choose(session, response, card)
      else {
        response = accept(session, response, card)
        const trade = options(response).find(option => option.value.startsWith('trade:'))
        expect(trade).toBeDefined()
        response = animals(session, choose(session, response, trade!.value))
      }
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 4, clay: 1, boar: 0, sheep: 0 })
    expect(response.state.events.filter(event => event.type === 'card.triggered' &&
      order.includes(event.sourceCardId ?? '')).map(event => event.sourceCardId)).toEqual(order)
    expect(response.state.log.some(entry => entry.key === 'log.cardTriggered' && entry.params?.cardId === 'E053_BoarSpear')).toBe(true)
    expect(response.scores).toHaveLength(2)
  })

  it.each(['workerless', 'movement'] as const)('preserves space origin during a card-granted %s use', mode => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.improvements = ['Major_Fireplace1']
      if (mode === 'movement') state.actionSpaces.find(space => space.id === 'forest')!.takenBy = [{ playerId: player.id, workerId: player.workers[0]!.id }]
    }, 5)
    listeners(session, [{ id: 'test-space-grant', cardIds: ['TEST_Grant'], actions: ['anytime'], phases: ['anytime'], handler: () => ({
      sourceCard: 'TEST_Grant', flow: jumpLeaf({ sourceCard: 'TEST_Grant', targetSpaceId: 'animal-market-56',
        ...(mode === 'movement' ? { workerId: session.state.players[0]!.workers[0]!.id } : {}),
      }),
    }) }])
    let response = session.takeAnytimeAction(0, 'test-space-grant')
    const pig = options(response).find(option => option.labelKey === 'actions.animal-market-56.option-boar')
    expect(pig, JSON.stringify(response.interaction)).toBeDefined()
    response = animals(session, choose(session, response, pig!.value))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, boar: 1 })
    expect(response.state.events.find(event => event.type === 'resource.moved' && event.resources.boar === 1)).toMatchObject({
      from: { kind: 'actionSpace', spaceId: 'animal-market-56' }, sourceCardId: 'TEST_Grant',
    })
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(1)
  })

  it('keeps card reward pigs separate from pigs collected in the same space context', () => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.improvements = ['Major_Fireplace1']
      player.pastures = [{ id: 'pig-pasture', tiles: [{ row: 0, col: 2 }], animalType: 'boar', animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
    })
    listeners(session, [{ id: 'test-extra-pig', cardIds: ['TEST_ExtraPig'], actionSpaces: ['pig-market'], phases: ['before'], mandatory: true,
      handler: () => ({ sourceCard: 'TEST_ExtraPig', flow: { type: 'leaf', actionId: 'gain', sourceCard: 'TEST_ExtraPig', params: { boar: 1 } } }),
    }])
    const response = animals(session, session.takeAction(0, 'pig-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 2, food: 1 })
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.resources.boar === 1).map(event => event.from.kind)).toEqual(['card', 'actionSpace'])
  })

  it('attributes a repeated original Animal Market option to the space', () => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.occupationPlayed = ['A180_AnimalBrander']
      player.improvements = ['Major_Fireplace1']
      player.pastures = [{ id: 'pig-pasture', tiles: [{ row: 0, col: 2 }], animalType: 'boar', animalCount: 0 }]
    }, 5)
    let response = session.takeAction(0, 'animal-market-56')
    const pig = options(response).find(option => option.labelKey === 'actions.animal-market-56.option-boar')
    expect(pig).toBeDefined()
    response = animals(session, choose(session, response, pig!.value))
    response = animals(session, accept(session, response, 'A180_AnimalBrander'))
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 2, food: 1 })
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(2)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.resources.boar === 1).map(event => event.from)).toEqual([
      { kind: 'actionSpace', spaceId: 'animal-market-56' }, { kind: 'actionSpace', spaceId: 'animal-market-56' },
    ])
  })

  it.each([
    { card: 'D180_PartTimeWorker', pigs: 4, food: 4, retained: 3, left: 2 },
    { card: 'D138_PetLover', pigs: 1, food: 3, retained: 1, left: 1 },
  ])('separates original collection from $card card rewards', ({ card, pigs, food, retained, left }) => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.occupationPlayed = [card]
      player.improvements = ['Major_Fireplace1']
      player.pastures = [{ id: 'pig-pasture', tiles: [{ row: 0, col: 2 }, { row: 1, col: 2 }], animalType: 'boar', animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = pigs
    }, 5)
    let response = animals(session, session.takeAction(0, 'pig-market'))
    const replacement = options(response).find(option => option.sourceCard === card)
    expect(replacement, JSON.stringify(response.interaction)).toBeDefined()
    response = animals(session, choose(session, response, replacement!.value))
    expect(response.state.players[0]!.resources).toMatchObject({ boar: retained, food })
    expect(response.state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar).toBe(left)
    expect(readCardResourceStats(response.state.players[0]!, HAT)?.used ?? 0).toBe(card === 'D180_PartTimeWorker' ? 1 : 0)
    const gains = response.state.events.filter(event => event.type === 'resource.moved' && (event.resources.boar ?? 0) > 0
      && event.to.kind === 'player')
    expect(gains.map(event => event.from.kind)).toEqual(card === 'D180_PartTimeWorker' ? ['actionSpace', 'card'] : ['card'])
  })

  it.each(['corral-6', 'D023_PioneeringSpirit'])('includes pigs directly supplied by %s', spaceId => {
    const session = opening(state => {
      state.round = 6
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.improvements = ['Major_Fireplace1']
      if (spaceId === 'corral-6') {
        player.resources.sheep = 1
        player.pastures = [{ id: 'sheep-pasture', tiles: [{ row: 0, col: 2 }], animalType: 'sheep', animalCount: 1 }]
      } else {
        player.minorPlayed.push(spaceId)
        state.actionSpaces.push(...createPlayerActionSpaces(state))
      }
    }, spaceId === 'corral-6' ? 6 : 2)
    let response = session.takeAction(0, spaceId)
    if (spaceId === 'D023_PioneeringSpirit') {
      const pig = options(response).find(option => option.labelKey === 'resources.boar')
      expect(pig).toBeDefined()
      response = choose(session, response, pig!.value)
    }
    response = animals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, food: 1 })
    expect(response.state.events.find(event => event.type === 'resource.moved' && event.resources.boar === 1)).toMatchObject({ from: { kind: 'actionSpace', spaceId } })
  })

  it('does not count spring action-space breeding as directly obtained goods', () => {
    const session = opening(state => {
      state.enableThroughTheSeasons = true
      state.throughTheSeasons = { currentSeason: 'spring', startSeason: 'spring' }
      state.actionSpaces.push(...createSeasonActionSpaces(2))
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.improvements = ['Major_Fireplace1']
      player.resources.boar = 2
      player.pastures = [{ id: 'pig-pasture', tiles: [{ row: 0, col: 2 }, { row: 1, col: 2 }], animalType: 'boar', animalCount: 2 }]
    })
    let response = session.takeAction(0, 'season-spring-animal-and-fruit')
    if (options(response).length) response = choose(session, response, options(response)[0]!.value)
    response = animals(session, response)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 3, food: 0 })
    expect(readCardResourceStats(response.state.players[0]!, HAT)?.used ?? 0).toBe(0)
  })

  it('can pass optional before sources and undoes a completed ordered window without replaying effects', () => {
    const session = opening(state => { state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3 })
    listeners(session, ['A', 'B'].map(id => ({ id, cardIds: [`TEST_${id}`], actionSpaces: ['forest'], phases: ['before'], handler: () => ({
      sourceCard: `TEST_${id}`, flow: { type: 'leaf', actionId: 'gain', optional: true, params: { food: 1 } },
    }) })))
    let response = session.takeAction(0, 'forest')
    response = choose(session, response, '__pass__')
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 0 })
    expect(readCardResourceStats(response.state.players[0]!, 'TEST_A')?.used ?? 0).toBe(0)
    expect(session.undoAction().ok).toBe(true)
    response = session.takeAction(0, 'forest')
    response = choose(session, response, 'TEST_B')
    response = choose(session, response, options(response).find(option => option.value !== '__skip__')!.value)
    response = choose(session, response, 'TEST_A')
    response = choose(session, response, options(response).find(option => option.value !== '__skip__')!.value)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 3, food: 2 })
    expect(readCardResourceStats(response.state.players[0]!, 'TEST_A').used).toBe(1)
    expect(readCardResourceStats(response.state.players[0]!, 'TEST_B').used).toBe(1)
    expect(response.state.events.filter(event => event.type === 'card.triggered')).toHaveLength(2)
  })

  it('retains required counter updates and rewards when ordering native before sources', () => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = ['B048_ForestStone']
      player.occupationPlayed = ['C148_MudWallower']
      player.cardStates = { B048_ForestStone: { extraData: { foodCount: 2 } }, C148_MudWallower: { counters: { counter: 0, held: 0 } } }
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    let response = session.takeAction(0, 'forest')
    expect(options(response).find(option => option.value === '__pass__')?.disabled).toBe(true)
    expect(session.resolveChoice(0, '__pass__').ok).toBe(false)
    response = choose(session, session.getState(), 'C148_MudWallower')
    expect(options(response).find(option => option.value === '__pass__')?.disabled).toBe(true)
    response = choose(session, response, 'B048_ForestStone')
    expect(response.state.players[0]!.resources, JSON.stringify(response.interaction)).toMatchObject({ wood: 3, food: 1 })
    expect(response.state.players[0]!.cardStates?.C148_MudWallower?.counters?.counter).toBe(1)
    expect(response.state.players[0]!.cardStates?.B048_ForestStone?.extraData?.foodCount).toBe(1)
  })

  it('keeps Animal Catcher replacement animals out of the Hat receipt', () => {
    const session = opening(state => {
      state.round = 14
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.occupationPlayed = ['C168_AnimalCatcher']
      player.improvements = ['Major_Fireplace1']
      player.resources.food = 1
      player.pastures = ['sheep', 'boar', 'cattle'].map((animal, index) => ({ id: animal, tiles: [{ row: index, col: 2 }], animalCount: 0 }))
    }, 4)
    let response = session.takeAction(0, 'day-laborer')
    const replacement = options(response).find(option => option.sourceCard === 'C168_AnimalCatcher')
    expect(replacement).toBeDefined()
    response = animals(session, choose(session, response, replacement!.value))
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, food: 0 })
    expect(readCardResourceStats(response.state.players[0]!, HAT)?.used ?? 0).toBe(0)
    expect(response.state.events.find(event => event.type === 'resource.moved' && event.resources.boar === 1)).toMatchObject({ from: { kind: 'card', cardId: 'C168_AnimalCatcher' } })
  })

  it('does not treat an occupation onBuy pig as goods from the Lessons space', () => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.improvements = ['Major_Fireplace1']
      player.occupationHand = ['A165_PigBreeder']
    })
    let response = session.takeAction(0, 'lessons')
    const occupation = options(response).find(option => option.sourceCard === 'A165_PigBreeder' || option.value === 'A165_PigBreeder')
    if (occupation) response = choose(session, response, occupation.value)
    response = animals(session, response)
    expect(response.state.players[0]!.occupationPlayed).toContain('A165_PigBreeder')
    expect(response.state.players[0]!.resources).toMatchObject({ boar: 1, food: 0 })
    expect(readCardResourceStats(response.state.players[0]!, HAT)?.used ?? 0).toBe(0)
    expect(response.state.events.find(event => event.type === 'resource.moved' && event.resources.boar === 1)).toMatchObject({ from: { kind: 'card', cardId: 'A165_PigBreeder' } })
  })

  it.each(['sheep', 'cattle'])('does not grant Hat food for Animal Market %s', animal => {
    const session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT]
      player.improvements = ['Major_Fireplace1']
      player.resources.food = 1
    }, 5)
    let response = session.takeAction(0, 'animal-market-56')
    const option = options(response).find(option => option.labelKey === `actions.animal-market-56.option-${animal}`)
    expect(option).toBeDefined()
    response = animals(session, choose(session, response, option!.value))
    expect(response.state.players[0]!.resources).toMatchObject({ [animal]: 1, boar: 0, food: animal === 'sheep' ? 2 : 0 })
    expect(readCardResourceStats(response.state.players[0]!, HAT)?.used ?? 0).toBe(0)
  })

  it('freezes before sources when an earlier source plays a new card', () => {
    const session = opening(state => {
      state.players[0]!.occupationHand = ['A165_PigBreeder']
      state.actionSpaces.find(space => space.id === 'forest')!.resources.wood = 3
    })
    listeners(session, [
      { id: 'test-play', cardIds: ['TEST_Play'], actionSpaces: ['forest'], phases: ['before'], handler: () => ({
        sourceCard: 'TEST_Play', flow: { type: 'leaf', actionId: 'occupation', params: { exactCost: {} } },
      }) },
      { id: 'test-food', cardIds: ['TEST_Food'], actionSpaces: ['forest'], phases: ['before'], handler: () => ({
        sourceCard: 'TEST_Food', flow: { type: 'leaf', actionId: 'gain', params: { food: 1 } },
      }) },
    ])
    session.withCtx(() => requireActiveCardRegistry('frozen-before-test').registerListener({
      id: 'test-new-card', cardIds: ['A165_PigBreeder'], actionSpaces: ['forest'], phases: ['before'], handler: () => ({
        sourceCard: 'A165_PigBreeder', flow: { type: 'leaf', actionId: 'gain', params: { food: 5 } },
      }),
    }))
    let response = session.takeAction(0, 'forest')
    response = animals(session, choose(session, response, 'TEST_Play'))
    expect(response.state.players[0]!.occupationPlayed).toContain('A165_PigBreeder')
    expect(options(response).map(option => option.sourceCard).filter(Boolean)).toEqual(['TEST_Food'])
    response = choose(session, response, 'TEST_Food')
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 3, boar: 1 })
    expect(readCardResourceStats(response.state.players[0]!, 'A165_PigBreeder')?.used ?? 0).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'A165_PigBreeder')).toEqual([expect.objectContaining({ resources: { boar: 1 } })])
  })

  it.each([false, true])('finishes Hat food descendants before returning to the immediate window across restore, conversion=%s', conversion => {
    let session = opening(state => {
      const player = state.players[0]!
      player.minorPlayed = [HAT, 'C025_SteamMachine', ...(conversion ? ['E053_BoarSpear'] : [])]
      player.improvements = ['Major_Fireplace1']
      player.resources.grain = 1
      state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy = [{ playerId: player.id, workerId: player.workers[1]!.id }]
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 1
    })
    const reaction: CardListenerRegistration = {
      id: 'test-after-hat-food', cardIds: ['TEST_AfterFood'], actions: ['gain'], phases: ['after'],
      handler: context => context.actionEvents?.some(event => event.type === 'resource.moved' && event.sourceCardId === HAT && event.resources.food === 1)
        ? { sourceCard: 'TEST_AfterFood', flow: { type: 'leaf', actionId: 'gain', params: { food: 10 } } } : undefined,
    }
    listeners(session, [reaction])
    let response = animals(session, session.takeAction(0, 'pig-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 1, boar: 1 })
    response = choose(session, response, HAT)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 11, grain: 1, boar: 1 })
    session = restore(session)
    session.withCtx(() => requireActiveCardRegistry('hat-after-restore').registerListener(reaction))
    response = session.getState()
    if (conversion) {
      response = accept(session, response, 'E053_BoarSpear')
      const trade = options(response).find(option => option.value.startsWith('trade:'))
      expect(trade).toBeDefined()
      response = choose(session, response, trade!.value)
      expect(response.state.players[0]!.resources).toMatchObject({ food: 15, grain: 1, boar: 0 })
    }
    response = accept(session, response, 'C025_SteamMachine')
    expect(response.state.players[0]!.resources).toMatchObject({ food: conversion ? 17 : 13, grain: 0, boar: conversion ? 0 : 1 })
    expect(readCardResourceStats(response.state.players[0]!, HAT).used).toBe(1)
    expect(readCardResourceStats(response.state.players[0]!, 'TEST_AfterFood').used).toBe(1)
    const steam = response.state.events.findIndex(event => event.type === 'card.triggered' && event.sourceCardId === 'C025_SteamMachine')
    const after = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === 'TEST_AfterFood')
    expect(after).toBeGreaterThanOrEqual(0)
    expect(steam).toBeGreaterThan(after)
  })
})
