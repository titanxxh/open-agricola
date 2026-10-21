import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import type { GameState, Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { jumpLeaf } from '../../shared/cards/helpers/jump-leaf'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))
function make(card: string, configure?: (state: GameState) => void) {
  const session = createWorkSession({ options: {
    enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true,
  }, configure: state => {
    state.round = 5
    for (const player of state.players) {
      Object.keys(player.resources).forEach(key => Reflect.set(player.resources, key, 0))
      player.farmTerrain = []
      player.sickWorkerIds = []
    }
    state.players[0]!.minorPlayed = [card]
    state.actionSpaces.find(space => space.id === 'fishing')!.resources = { food: 2 }
    state.actionSpaces.find(space => space.id === 'forest')!.resources = { wood: 3 }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}
function choose(session: GameSession, response: SessionResponse, accept = true) {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') throw new Error('Expected choice')
  const option = (response.interaction.request.options ?? []).find(option => accept
    ? !['__skip__', '__pass__'].includes(option.value) : option.value === '__skip__')
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  const next = session.resolveChoice(response.interaction.playerIndex, option!.value)
  expect(next.ok, next.error).toBe(true)
  return next
}
function beforeHost(response: SessionResponse, card: string, type = 'resource.moved') {
  const reward = response.state.events.findIndex(event => event.type === type && event.sourceCardId === card)
  const host = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === undefined)
  expect(reward).toBeGreaterThanOrEqual(0)
  expect(host).toBeGreaterThan(reward)
  expect(response.state.log.length).toBeGreaterThan(0)
  expect(response.scores).toHaveLength(2)
}
function rewardTests(card: string, space: string, expected: Partial<Resource>, configure?: (state: GameState) => void, horse = false) {
  describe(`${card} before ${space}`, () => {
    it('grants its reward before the host gains resources', () => {
      const session = make(card, configure)
      let response = session.takeAction(0, space)
      expect(response.ok, response.error).toBe(true)
      if (horse && response.interaction.stateId === 'wait' && response.interaction.request.kind === 'animal-reorg') {
        response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house:1-0', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
        expect(response.ok, response.error).toBe(true)
      }
      expect(response.state.players[0]!.resources).toMatchObject(expected)
      beforeHost(response, card)
      expect(response.interaction.stateId).toBe('wait')
    }, 30_000)
    it('does not grant the reward for Forest', () => {
      const response = make(card, configure).takeAction(0, 'forest')
      expect(response.ok, response.error).toBe(true)
      expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === card)).toEqual([])
    }, 30_000)
  })
}

rewardTests('M087_PeatBarge', 'fishing', { fuel: 2, food: 2 })


rewardTests('M083_CoalSeam', 'day-laborer', { fuel: 1, food: 2 })
it('M083_CoalSeam grants fuel before the Hiring Fair special action', () => {
  const session = make('M083_CoalSeam')
  const special = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('hiring-fair'))!
  const response = session.takeSpecialAction(0, special.id, 'hiring-fair')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.fuel).toBe(1)
  beforeHost(response, 'M083_CoalSeam')
}, 30_000)


rewardTests('M114_RiversideWoods', 'fishing', { wood: 2, food: 2 }, state => {
  state.players[0]!.farmTerrain = [{ row: 0, col: 2, kind: 'forest' }, { row: 0, col: 3, kind: 'forest' }]
})
it('M114_RiversideWoods grants no wood without forests', () => {
  const response = make('M114_RiversideWoods').takeAction(0, 'fishing')
  expect(response.ok, response.error).toBe(true)
  expect(response.state.players[0]!.resources.wood).toBe(0)
}, 30_000)

rewardTests('M120_RiverClay', 'fishing', { clay: 2, food: 2 })

rewardTests('M124_StoneWagon', 'day-laborer', { stone: 1, food: 2 })

rewardTests('M130_Nosebag', 'grain-seeds', { horse: 1, grain: 1 }, undefined, true)

describe('M094_PeatBath before Infirmary', () => {
  it.each([true, false])('queues future food before the host only with visible moors: %s', moors => {
    const session = make('M094_PeatBath', state => {
      state.players[0]!.farmTerrain = moors ? [{ row: 0, col: 2, kind: 'moor' }, { row: 0, col: 3, kind: 'moor' }] : []
    })
    const response = session.takeAction(0, 'moor-infirmary')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.futureMeeples.filter(entry => entry.cardId === 'M094_PeatBath').map(entry => ({ round: entry.round, resources: entry.resources })))
      .toEqual(moors ? [{ round: 6, resources: { food: 1 } }, { round: 7, resources: { food: 1 } }] : [])
    if (moors) beforeHost(response, 'M094_PeatBath', 'futureMeeple.queued')
    expect(response.state.players[0]!.resources.food).toBe(1)
  }, 30_000)
})

describe('M098_FishSmokehouse before Fishing', () => {
  it('pays its fuel and gains food before the host collects', () => {
    const session = make('M098_FishSmokehouse', state => { state.players[0]!.resources.fuel = 1 })
    let response = session.takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M098_FishSmokehouse' })
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.actionSpaces.find(space => space.id === 'fishing')!.resources.food).toBe(2)
    response = choose(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ fuel: 0, food: 5 })
    beforeHost(response, 'M098_FishSmokehouse')
  }, 30_000)
  it('does not offer its purchase without fuel', () => {
    const response = make('M098_FishSmokehouse').takeAction(0, 'fishing')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(2)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe('M098_FishSmokehouse')
  }, 30_000)
})

describe('M042_DeepPlow before Farmland', () => {
  it.each([true, false])('resolves or declines its moor conversion before the host plow: %s', accept => {
    const session = make('M042_DeepPlow', state => {
      state.players[0]!.farmTerrain = [{ row: 0, col: 2, kind: 'moor' }]
    })
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M042_DeepPlow' })
    expect(response.state.players[0]!.fields).toHaveLength(0)
    response = choose(session, response, accept)
    if (accept) {
      response = session.commitSelectionChoice(0, { positions: [{ row: 0, col: 2 }] })
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.fields).toEqual([{ row: 0, col: 2, stacks: [] }])
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(accept ? 2 : 1)
    expect(response.state.players[0]!.farmTerrain).toHaveLength(accept ? 0 : 1)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  }, 30_000)
  it('does not offer a conversion without a moor', () => {
    const response = make('M042_DeepPlow').takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe('M042_DeepPlow')
  }, 30_000)
})

describe('M129_PlowhorseMarket before Farmland', () => {
  it.each([true, false])('resolves its horse purchase before the host plow: %s', accept => {
    const session = make('M129_PlowhorseMarket', state => { state.players[0]!.resources.food = 1 })
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'M129_PlowhorseMarket' })
    expect(response.state.players[0]!.fields).toHaveLength(0)
    response = choose(session, response, accept)
    if (accept) {
      expect(response.state.players[0]!.resources).toMatchObject({ food: 0, horse: 1 })
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
      response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'house:1-0', zoneType: 'house', animalType: 'horse', animalCount: 1 }] })
      expect(response.ok, response.error).toBe(true)
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select', farm: { farmType: 'plow' } } })
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ food: accept ? 0 : 1, horse: accept ? 1 : 0 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.log.length).toBeGreaterThan(0)
    expect(response.scores).toHaveLength(2)
  }, 30_000)
  it('does not offer a horse without food', () => {
    const response = make('M129_PlowhorseMarket').takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction.stateId === 'wait' && response.interaction.sourceCard).not.toBe('M129_PlowhorseMarket')
    expect(response.state.players[0]!.resources.horse).toBe(0)
  }, 30_000)
})

describe('M099_HealingClay before the current Infirmary visit', () => {
  it.each(['sick', 'healthy', 'other-sick-worker'])('rewards only the current sick visitor: %s', mode => {
    const session = make('M099_HealingClay', state => {
      const player = state.players[0]!
      if (mode === 'sick') player.sickWorkerIds = [player.workers[0]!.id]
      if (mode === 'other-sick-worker') {
        const worker = player.workers[1]!
        player.sickWorkerIds = [worker.id]
        state.actionSpaces.find(space => space.id === 'moor-infirmary')!.takenBy = [{ playerId: player.id, workerId: worker.id }]
      }
    })
    const response = session.takeAction(0, 'moor-infirmary')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(mode === 'sick' ? 2 : 1)
    expect(response.state.actionSpaces.find(space => space.id === 'moor-infirmary')!.takenBy).toHaveLength(mode === 'other-sick-worker' ? 2 : 1)
    if (mode === 'sick') beforeHost(response, 'M099_HealingClay')
    else expect(response.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === 'M099_HealingClay')).toEqual([])
  }, 30_000)

  it('does not borrow a sick worker identity for a workerless visit', () => {
    const session = make('M099_HealingClay', state => {
      const player = state.players[0]!
      player.sickWorkerIds = [player.workers[0]!.id]
      player.cardStates.__actionSnapshot__ = { extraData: { token: 1, lastToken: 1, placedWorkerId: player.workers[0]!.id } }
      player.minorPlayed.push('TEST_WorkerlessUse')
    })
    session.withCtx(() => requireActiveCardRegistry('healing-clay-workerless-test').registerListener({
      id: 'test-workerless-use', cardIds: ['TEST_WorkerlessUse'], actions: ['anytime'], phases: ['anytime'],
      handler: () => ({ sourceCard: 'TEST_WorkerlessUse', flow: jumpLeaf({ sourceCard: 'TEST_WorkerlessUse', targetSpaceId: 'moor-infirmary' }) }),
    }))
    const response = session.takeAnytimeAction(0, 'test-workerless-use')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)
    expect(response.state.actionSpaces.find(space => space.id === 'moor-infirmary')!.takenBy).toEqual([])
  }, 30_000)
})
