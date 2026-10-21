import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { setWorkersAtHome } from '../../shared/domain/player'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function make(cardId: string, { played = true, occupation = false, round = 5, playerCount = 2, configure }: {
  played?: boolean; occupation?: boolean; round?: number; playerCount?: number; configure?: (state: GameState) => void
} = {}) {
  const session = createWorkSession({ options: { playerCount }, configure: state => {
    state.round = round
    for (const player of state.players) {
      Object.keys(player.resources).forEach(key => Reflect.set(player.resources, key, 0))
      player.cardStates = {}
      setWorkersAtHome(state, player, 2)
    }
    for (const space of state.actionSpaces) space.takenBy = []
    const player = state.players[0]!
    if (played) (occupation ? player.occupationPlayed : player.minorPlayed).push(cardId)
    state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
    state.actionSpaces.find(space => space.id === 'fishing')!.resources = { food: 2 }
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources = { sheep: 1 }
    player.pastures = [{ id: 'p1', tiles: [{ row: 0, col: 2 }], animalType: null, animalCount: 0, size: 1, stables: 0 }]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function assertBeforeHost(response: SessionResponse, cardId: string, eventType = 'resource.moved') {
  const effect = response.state.events.findIndex(event => event.type === eventType && event.sourceCardId === cardId)
  const host = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === undefined)
  expect(effect).toBeGreaterThanOrEqual(0)
  expect(host).toBeGreaterThan(effect)
  expect(response.state.log.length).toBeGreaterThan(0)
  expect(response.scores).toHaveLength(response.state.players.length)
}

function roundSpace(state: GameState, spaceId: string, slot: number) {
  const previous = state.roundActionOrder.indexOf(spaceId)
  state.roundActionOrder[previous] = state.roundActionOrder[slot - 1]!
  state.roundActionOrder[slot - 1] = spaceId
}

function futureFoodTests(cardId: string, spaceId: string, rounds: number[], round = 5) {
  describe(`${cardId} before ${spaceId}`, () => {
    it('queues the future food before the host takes its goods', () => {
      const session = make(cardId, { round })
      const response = session.takeAction(0, spaceId)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.futureMeeples.filter(entry => entry.cardId === cardId).map(entry => ({ round: entry.round, resources: entry.resources })))
        .toEqual(rounds.map(round => ({ round, resources: { food: 1 } })))
      assertBeforeHost(response, cardId, 'futureMeeple.queued')
      expect(response.interaction.stateId).toBe('wait')
    }, 30_000)

    it.each(['without-card', 'different-space'])('does not queue future food for %s', mode => {
      const session = make(cardId, { round, played: mode !== 'without-card' })
      const response = session.takeAction(0, mode === 'different-space' ? 'forest' : spaceId)
      expect(response.ok, response.error).toBe(true)
      expect(response.state.futureMeeples.filter(entry => entry.cardId === cardId)).toEqual([])
    }, 30_000)
  })
}

futureFoodTests('A046_ClawKnife', 'sheep-market', [6, 7])

futureFoodTests('B043_Chophouse', 'grain-seeds', [10, 11, 12], 9)
futureFoodTests('B043_Chophouse', 'vegetable-seeds', [10, 11], 9)

futureFoodTests('B047_HerringPot', 'fishing', [6, 7, 8])

futureFoodTests('C045_Stew', 'day-laborer', [6, 7, 8, 9])

describe('B112_Silokeeper before Grain Utilization', () => {
  function sowing(played = true, slot = 4) {
    return make('B112_Silokeeper', { played, occupation: true, configure: state => {
      roundSpace(state, 'grain-utilization', slot)
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
    } })
  }

  it('supplies the grain for sowing inside this same space use', () => {
    const session = sowing()
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(true)
    let response = session.takeAction(0, 'grain-utilization')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'sow' } } })
    response = session.commitSelectionChoice(0, { crops: [{ row: 0, col: 0, crop: 'grain' }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] }])
    const gain = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === 'B112_Silokeeper')
    const sow = response.state.events.findIndex(event => event.type === 'farm.sown')
    expect(gain).toBeGreaterThanOrEqual(0)
    expect(sow).toBeGreaterThan(gain)
    expect(response.state.log.some(entry => entry.key === 'log.cardEffectGain' && entry.params?.cardId === 'B112_Silokeeper')).toBe(true)
    expect(response.scores).toHaveLength(2)
  }, 30_000)

  it.each([{ played: false, slot: 4 }, { played: true, slot: 3 }])('does not supply grain for %j', ({ played, slot }) => {
    const session = sowing(played, slot)
    expect(session.getActionAvailability(0)['grain-utilization']).toBe(false)
    const response = session.takeAction(0, 'grain-utilization')
    expect(response.ok).toBe(false)
    expect(response.state.players[0]!.resources.grain).toBe(0)
  }, 30_000)
})

describe('B137_Wholesaler before the corresponding space', () => {
  const rewards = [
    { space: 'vegetable-seeds', resource: 'vegetable', key: 'vegetableTaken' },
    { space: 'pig-market', resource: 'boar', key: 'boarTaken' },
    { space: 'eastern-quarry', resource: 'stone', key: 'stoneTaken' },
    { space: 'cattle-market', resource: 'cattle', key: 'cattleTaken' },
  ] as const

  it.each(rewards)('takes $resource from the card before the host at $space', ({ space, resource, key }) => {
    const session = make('B137_Wholesaler', { occupation: true, playerCount: 3, round: 11, configure: state => {
      state.actionSpaces.find(candidate => candidate.id === space)!.resources = { [resource]: 1 }
      state.players[0]!.cardStates.B137_Wholesaler = { extraData: { wholesaler: {
        vegetableTaken: false, boarTaken: false, stoneTaken: false, cattleTaken: false,
      } } }
    } })
    let response = session.takeAction(0, space)
    expect(response.ok, response.error).toBe(true)
    for (let step = 0; step < 2 && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg'; step++) {
      response = session.resolveChoice(0, 'confirm', { zones: [{
        id: 'p1', zoneType: 'pasture', animalType: resource, animalCount: response.state.players[0]!.resources[resource],
      }] })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.state.players[0]!.resources[resource]).toBe(2)
    expect(response.state.players[0]!.cardStates.B137_Wholesaler?.extraData?.wholesaler).toMatchObject({ [key]: true })
    assertBeforeHost(response, 'B137_Wholesaler')
    expect(response.interaction.stateId).toBe('wait')
  }, 30_000)

  it.each(rewards)('does not take an already used $resource reward', ({ space, resource, key }) => {
    const session = make('B137_Wholesaler', { occupation: true, playerCount: 3, round: 11, configure: state => {
      state.actionSpaces.find(candidate => candidate.id === space)!.resources = { [resource]: 1 }
      state.players[0]!.cardStates.B137_Wholesaler = { extraData: { wholesaler: { [key]: true } } }
    } })
    const response = session.takeAction(0, space)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources[resource]).toBe(1)
    expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'B137_Wholesaler')).toEqual([])
  }, 30_000)
})

describe('D055_NewMarket before a round-position host', () => {
  function quarry(played = true, slot = 8) {
    return make('D055_NewMarket', { round: 8, played, configure: state => {
      roundSpace(state, 'western-quarry', slot)
      state.actionSpaces.find(space => space.id === 'western-quarry')!.resources = { stone: 1 }
    } })
  }

  it('gains the food before collecting the round-eight quarry', () => {
    const response = quarry().takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, stone: 1 })
    assertBeforeHost(response, 'D055_NewMarket')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  }, 30_000)

  it.each([{ played: false, slot: 8 }, { played: true, slot: 7 }])('does not gain food for %j', ({ played, slot }) => {
    const response = quarry(played, slot).takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 })
  }, 30_000)
})

describe('D158_BeanCounter before a round-position host', () => {
  function quarry({ played = true, slot = 8, food = 2 } = {}) {
    return make('D158_BeanCounter', { occupation: true, playerCount: 4, round: 9, played, configure: state => {
      roundSpace(state, 'western-quarry', slot)
      state.actionSpaces.find(space => space.id === 'western-quarry')!.resources = { stone: 1 }
      state.players[0]!.cardStates.D158_BeanCounter = { counters: { food } }
    } })
  }

  it('releases its third food before the host collects', () => {
    const response = quarry().takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 3, stone: 1 })
    expect(response.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food).toBe(0)
    assertBeforeHost(response, 'D158_BeanCounter')
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  }, 30_000)

  it('stores its first food before the host collects', () => {
    const response = quarry({ food: 0 }).takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 })
    expect(response.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food).toBe(1)
    const change = response.state.events.findIndex(event => event.type === 'card.stateChanged' && event.cardId === 'D158_BeanCounter')
    const collect = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === undefined)
    expect(change).toBeGreaterThanOrEqual(0)
    expect(collect).toBeGreaterThan(change)
  }, 30_000)

  it.each([{ played: false, slot: 8 }, { played: true, slot: 9 }])('does not change its food for %j', config => {
    const response = quarry(config).takeAction(0, 'western-quarry')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, stone: 1 })
    expect(response.state.players[0]!.cardStates.D158_BeanCounter?.counters?.food).toBe(2)
  }, 30_000)
})

describe('E040_BeeStatue before Day Laborer', () => {
  const stack = ['vegetable', 'stone', 'grain', 'stone', 'grain']
  function statue(empty = false) {
    return make('E040_BeeStatue', { configure: state => {
      state.players[0]!.cardStates.E040_BeeStatue = { stack: empty ? [] : [...stack] }
    } })
  }

  it('takes its top grain before the host gains food', () => {
    const response = statue().takeAction(0, 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, food: 2 })
    expect(response.state.players[0]!.cardStates.E040_BeeStatue?.stack).toEqual(['vegetable', 'stone', 'grain', 'stone'])
    assertBeforeHost(response, 'E040_BeeStatue')
    const pop = response.state.events.findIndex(event => event.type === 'card.stackChanged' && event.cardId === 'E040_BeeStatue')
    const gain = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === 'E040_BeeStatue')
    expect(pop).toBeGreaterThanOrEqual(0)
    expect(gain).toBeGreaterThan(pop)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  }, 30_000)

  it.each(['empty-stack', 'different-space'])('does not take a top good for %s', mode => {
    const response = statue(mode === 'empty-stack').takeAction(0, mode === 'different-space' ? 'forest' : 'day-laborer')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(response.state.players[0]!.cardStates.E040_BeeStatue?.stack).toEqual(mode === 'empty-stack' ? [] : stack)
    expect(response.state.events.filter(event => event.type === 'card.stackChanged' && event.cardId === 'E040_BeeStatue')).toEqual([])
  }, 30_000)
})
