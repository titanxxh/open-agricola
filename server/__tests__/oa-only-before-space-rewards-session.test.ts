import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make(cardId: string, configure?: (state: GameState) => void, playerCount = 5) {
  const session = createWorkSession({ options: { playerCount }, configure: state => {
    state.round = 8
    for (const player of state.players) Object.keys(player.resources).forEach(key => Reflect.set(player.resources, key, 0))
    const player = state.players[0]!
    player.occupationPlayed = [cardId]
    for (const space of state.actionSpaces) space.takenBy = []
    state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
    const copse = state.actionSpaces.find(space => space.id === 'copse-56')
    if (copse) copse.resources = { wood: 2 }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function choose(session: GameSession, response: SessionResponse, value?: string) {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected choice')
  const option = (response.interaction.request.options ?? []).find(option => value
    ? option.value === value : !['__skip__', '__pass__'].includes(option.value))
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  const next = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function beforeCollect(response: SessionResponse, cardId: string, type = 'resource.moved') {
  const reward = response.state.events.findIndex(event => event.type === type && event.sourceCardId === cardId)
  const host = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === undefined)
  expect(reward).toBeGreaterThanOrEqual(0)
  expect(host).toBeGreaterThan(reward)
  expect(response.state.log.length).toBeGreaterThan(0)
  expect(response.scores).toHaveLength(response.state.players.length)
}

describe('A113_HeresyTeacher before Lessons', () => {
  it('does not react to the Lessons use that first plays this card', () => {
    const session = make('A113_HeresyTeacher', state => {
      state.players[0]!.occupationPlayed = []
      state.players[0]!.occupationHand = ['A113_HeresyTeacher']
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }]
    }, 2)
    const response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain('A113_HeresyTeacher')
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
  }, 30_000)

  it.each([3, 2])('inserts below %i grain before the occupation selection only when eligible', grain => {
    const session = make('A113_HeresyTeacher', state => {
      const player = state.players[0]!
      player.fields = [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: grain }] }]
      player.occupationHand = ['A143_Stonecutter', 'A124_Knapper']
      player.resources.food = 1
    }, 2)
    let response = session.takeAction(0, 'lessons')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual(grain === 3
      ? [{ kind: 'vegetable', remaining: 1 }, { kind: 'grain', remaining: 3 }]
      : [{ kind: 'grain', remaining: 2 }])
    response = choose(session, response, 'A143_Stonecutter')
    expect(response.state.players[0]!.occupationPlayed).toContain('A143_Stonecutter')
    expect(response.state.log.some(entry => entry.key === 'log.playOccupation')).toBe(true)
    expect(response.scores).toHaveLength(2)
  }, 30_000)
})

function basicRewardTests(card: string, space: string, expected: Partial<Resource>, configure?: (state: GameState) => void, animal?: 'sheep') {
  describe(`${card} before ${space}`, () => {
    it('grants its reward before collecting the host goods', () => {
      const session = make(card, configure)
      let response = session.takeAction(0, space)
      expect(response.ok, response.error).toBe(true)
      if (animal && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
        response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'p1', zoneType: 'pasture', animalType: animal, animalCount: 1 }] })
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.state.players[0]!.resources).toMatchObject(expected)
      beforeCollect(response, card)
      expect(response.interaction.stateId).toBe('wait')
    }, 30_000)
    it('does not reward a different space', () => {
      const response = make(card, configure).takeAction(0, 'grain-seeds')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card)).toEqual([])
    }, 30_000)
  })
}

basicRewardTests('A177_Middleman', 'copse-56', { stone: 1, food: 1, wood: 2 }, state => {
  state.players[0]!.cardStates.A177_Middleman = { extraData: { actionSpaceAttachments: [{ spaceId: 'copse-56', resources: { stone: 1, food: 1 } }] } }
})

basicRewardTests('A179_MountainShepherd', 'western-quarry', { sheep: 1, stone: 1 }, state => {
  state.actionSpaces.find(space => space.id === 'western-quarry')!.resources = { stone: 1 }
  state.players[0]!.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 2 }], size: 1, stables: 0, animalType: null, animalCount: 0 }]
}, 'sheep')

basicRewardTests('B174_RiverbankGardener', 'riverbank-forest-56', { vegetable: 1, wood: 2 }, state => {
  state.actionSpaces.find(space => space.id === 'riverbank-forest-56')!.resources = { wood: 2 }
})

basicRewardTests('D176_Woodshacker', 'forest', { clay: 1, wood: 3 })

describe('B173_Sweeper before a meeple-symbol host', () => {
  it('stores its food before collecting the copse', () => {
    const response = make('B173_Sweeper').takeAction(0, 'copse-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.B173_Sweeper?.counters?.food).toBe(1)
    expect(response.state.players[0]!.resources.wood).toBe(2)
    beforeCollect(response, 'B173_Sweeper', 'card.infoboxChanged')
  }, 30_000)
  it('does not store food after the card has been cashed out', () => {
    const response = make('B173_Sweeper', state => {
      state.players[0]!.cardStates.B173_Sweeper = { counters: { food: 0 }, extraData: { cashedOut: true } }
    }).takeAction(0, 'copse-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.cardStates.B173_Sweeper?.counters?.food).toBe(0)
  }, 30_000)
})

describe('B176_VillageIdiot before Meeting Place', () => {
  it.each([1, 0])('rewards only the owner before player %i reaches the minor prompt', actor => {
    const session = make('B176_VillageIdiot', state => {
      state.currentPlayerIndex = actor
      state.players[actor]!.minorHand = ['B004_WoodPile']
    })
    const response = session.takeAction(actor, 'meeting-place')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait' })
    expect(response.state.players[0]!.resources).toMatchObject({ food: actor === 1 ? 1 : 0, wood: actor === 1 ? 1 : 0 })
    if (actor === 1) expect(response.state.players[1]!.resources).toMatchObject({ food: 0, wood: 0 })
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(5)
  }, 30_000)
})

describe('C173_TopOuter before House Building', () => {
  it.each([0, 1])('collects for the card owner before player %i builds the room', actor => {
    const session = make('C173_TopOuter', state => {
      state.currentPlayerIndex = actor
      Object.assign(state.players[actor]!.resources, { wood: 5, reed: 2 })
      state.actionSpaces.find(space => space.id === 'traveling-players-56')!.resources = { food: 3 }
    })
    let response = session.takeAction(actor, 'house-building-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: actor, request: { kind: 'farm-select', farm: { farmType: 'room' } } })
    expect(response.state.players[0]!.resources.food).toBe(3)
    if (actor === 1) expect(response.state.players[1]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'traveling-players-56')!.resources.food).toBe(0)
    response = session.commitSelectionChoice(actor, { rooms: [{ row: 0, col: 0 }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[actor]!.rooms).toBe(3)
    const collect = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === 'C173_TopOuter')
    const room = response.state.events.findIndex(event => event.type === 'farm.roomBuilt')
    expect(collect).toBeGreaterThanOrEqual(0)
    expect(room).toBeGreaterThan(collect)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(5)
  }, 30_000)
  it('has no reward when the linked food pile is empty', () => {
    const session = make('C173_TopOuter', state => {
      Object.assign(state.players[0]!.resources, { wood: 5, reed: 2 })
      state.actionSpaces.find(space => space.id === 'traveling-players-56')!.resources = { food: 0 }
    })
    const response = session.takeAction(0, 'house-building-56')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  }, 30_000)
})

describe('C176_Cleanacre before Farmland', () => {
  it('gets its clay before the plow selection', () => {
    const session = make('C176_Cleanacre')
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    expect(response.state.players[0]!.resources.clay).toBe(2)
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    const gain = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === 'C176_Cleanacre')
    const plow = response.state.events.findIndex(event => event.type === 'farm.fieldPlowed')
    expect(gain).toBeGreaterThanOrEqual(0)
    expect(plow).toBeGreaterThan(gain)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(5)
  }, 30_000)
  it('does not grant clay for Forest', () => {
    const response = make('C176_Cleanacre').takeAction(0, 'forest')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
  }, 30_000)
})

describe('D174_LoessGardener before Clay Pit', () => {
  it('offers and pays for its vegetable before collecting clay', () => {
    const session = make('D174_LoessGardener', state => {
      state.players[0]!.resources.food = 1
      state.actionSpaces.find(space => space.id === 'clay-pit')!.resources = { clay: 2 }
    })
    let response = session.takeAction(0, 'clay-pit')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'D174_LoessGardener' })
    expect(response.state.players[0]!.resources.clay).toBe(0)
    response = choose(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, vegetable: 1, clay: 2 })
    beforeCollect(response, 'D174_LoessGardener')
  }, 30_000)
  it('does not offer its purchase without food', () => {
    const response = make('D174_LoessGardener').takeAction(0, 'clay-pit')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(0)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe('D174_LoessGardener')
  }, 30_000)
})

it('A177_Middleman does not take an attachment for workerless use', () => {
  const session = make('A177_Middleman', state => {
    state.players[0]!.cardStates.A177_Middleman = { extraData: { actionSpaceAttachments: [{ spaceId: 'copse-56', resources: { stone: 1, food: 1 } }] } }
    state.players[0]!.minorPlayed.push('TEST_WorkerlessUse')
  })
  session.withCtx(() => requireActiveCardRegistry('middleman-workerless-test').registerListener({
    id: 'test-workerless-use', cardIds: ['TEST_WorkerlessUse'], actions: ['anytime'], phases: ['anytime'],
    handler: () => ({ sourceCard: 'TEST_WorkerlessUse', flow: jumpLeaf({ sourceCard: 'TEST_WorkerlessUse', targetSpaceId: 'copse-56' }) }),
  }))
  const response = session.takeAnytimeAction(0, 'test-workerless-use')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, stone: 0, food: 0 })
  expect(response.state.players[0]!.cardStates.A177_Middleman?.extraData?.actionSpaceAttachments).toEqual([{ spaceId: 'copse-56', resources: { stone: 1, food: 1 } }])
}, 30_000)
