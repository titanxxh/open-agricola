import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNext } from './_helpers/session-assertions'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import type { GameState } from '../../shared/contract/types'

const CARD_ID = 'B140_FarmyardWorker'
const sessions: GameSession[] = []
const track = (session: GameSession) => { sessions.push(session); return session }
const succeeded = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}

const setup = (actor = 0, prepare?: (state: GameState) => void, moor = false) => track(createWorkSession({
  seed: 42,
  options: { playerCount: 3, enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: moor },
  configure(state) {
    state.round = 10
    state.currentPlayerIndex = actor
    state.roundActionOrder = ['grain-utilization', 'sheep-market',
      ...state.roundActionOrder.filter(id => id !== 'grain-utilization' && id !== 'sheep-market')]
    for (const space of state.actionSpaces) space.takenBy = []
    const occupiedSpaces = state.actionSpaces.filter(space => space.roundAvailable === 1
      && space.id !== 'forest' && space.id !== 'grain-utilization')
    let occupied = 0
    for (const [index, player] of state.players.entries()) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.minorPlayed = []
      player.occupationPlayed = index === 0 ? [CARD_ID] : []
      player.cardStates = {}
      player.fields = []
      player.farmTerrain = []
      Object.assign(player.resources, {
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0, begging: 0,
      })
      if (index !== actor) {
        for (const worker of player.workers.filter(worker => worker.isActive)) {
          occupiedSpaces[occupied++]!.takenBy.push({ playerId: player.id, workerId: worker.id })
        }
      }
    }
    state.players[actor]!.fields = [{ row: 0, col: 1, stacks: [] }]
    state.players[actor]!.resources.grain = 1
    prepare?.(state)
  },
}))

const sow = (session: GameSession, actor = 0) => {
  let response = succeeded(session.takeAction(actor, 'grain-utilization'))
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
    const option = response.interaction.request.options.find(item => item.value === 'sow')
    expect(option).toBeDefined()
    response = succeeded(session.resolveChoice(actor, option!.value))
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
  return succeeded(session.commitSelectionChoice(actor, { crops: [{ row: 0, col: 1, crop: 'grain' }] }))
}

const endWork = (session: GameSession, response: SessionResponse, actor = 0) => {
  confirmNext(session, response)
  let last = succeeded(session.takeAction(actor, 'forest'))
  if (last.interaction.stateId === 'wait' && last.interaction.request.kind === 'confirm-next-player') {
    last = confirmNext(session, last)
  }
  if (last.state.round === 10) last = succeeded(session.performRoundEnd())
  return last
}

describe('B140 farmyard facts in its official three-player game', () => {
  afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

  it('records real sowing without early food and pays once at the end of work', () => {
    const session = setup()
    const response = sow(session)
    expect(response.state.players).toHaveLength(3)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 0, grain: 0 })
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    const scores = structuredClone(response.scores)
    const ended = endWork(session, response)
    expect(ended.state.players[0]!.resources.food).toBe(2)
    expect(ended.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(false)
    expect(ended.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
    expect(ended.scores).toEqual(scores)
    expect(ended.state.players.slice(1).map(player => player.resources.food)).toEqual([0, 0])
  })

  it.each([false, true])('preserves qualification through JSON recovery and legal undo (%s)', undo => {
    const original = setup()
    const pending = sow(original)
    const serialized = original.withCtx(() => serializeSessionSnapshot(original.state, original))
    const restored = track(new GameSession(rehydrateState(JSON.parse(JSON.stringify(serialized)))))
    expect(restored.getState().interaction).toEqual(pending.interaction)
    expect(restored.getState().scores).toEqual(pending.scores)
    let response = restored.getState()
    if (undo) {
      const undone = succeeded(restored.undoAction())
      expect(undone.state.players[0]!.resources.grain).toBe(1)
      expect(undone.state.players[0]!.fields[0]!.stacks).toEqual([])
      expect(undone.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
      response = sow(restored)
    }
    const ended = endWork(restored, response)
    expect(ended.state.players[0]!.resources.food).toBe(2)
    expect(ended.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toHaveLength(1)
  })

  it('does not qualify its owner when another player sows', () => {
    const session = setup(1)
    const response = sow(session, 1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).not.toBe(true)
    const ended = endWork(session, response, 1)
    expect(ended.state.players.map(player => player.resources.food)).toEqual([0, 0, 0])
    expect(ended.state.events.filter(event => event.type === 'resource.moved' && event.sourceCardId === CARD_ID)).toEqual([])
  })

  it('qualifies when a newly acquired animal is actually accommodated on the farmyard', () => {
    const session = setup(0, state => {
      const player = state.players[0]!
      player.fields = []
      player.fenceSegments = ['H-0-1', 'H-1-1', 'V-0-1', 'V-0-2'].map(edge => ({ edge, type: 'fence' }))
      player.pastures = [{ id: 'goods-pasture', size: 1, tiles: [{ row: 0, col: 1 }],
        stables: 0, animalType: null, animalCount: 0 }]
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
    })
    const pending = succeeded(session.takeAction(0, 'sheep-market'))
    expect(pending.interaction.request.kind).toBe('animal-reorg')
    const response = succeeded(session.resolveChoice(0, 'confirm', { zones: [
      { id: 'goods-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
    ] }))
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(1)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(endWork(session, response).state.players[0]!.resources.food).toBe(2)
  })

  it('qualifies when a real card adds a crop to an existing farmyard field', () => {
    const session = setup(0, state => {
      const player = state.players[0]!
      player.minorPlayed = ['M112_PeatAshFertilizer']
      player.fields[0]!.stacks = [{ kind: 'grain', remaining: 2 }]
      player.farmTerrain = [{ row: 2, col: 4, kind: 'moor' }]
    }, true)
    const special = session.state.farmersOfTheMoor!.specialActionCards.find(card => card.actions.includes('cut-peat'))!
    const pending = succeeded(session.takeSpecialAction(0, special.id, 'cut-peat', { tile: { row: 2, col: 4 } }))
    expect(pending.interaction.sourceCard).toBe('M112_PeatAshFertilizer')
    if (pending.interaction.stateId !== 'wait') throw new Error('Expected optional crop growth')
    const accept = pending.interaction.request.options?.find(option => option.value !== '__skip__')
    expect(accept).toBeDefined()
    const response = succeeded(session.resolveChoice(0, accept!.value))
    expect(response.state.players[0]!.fields[0]!.stacks).toEqual([{ kind: 'grain', remaining: 3 }])
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
  })

  it('qualifies when a real card places a resource token on a farmyard field', () => {
    const session = setup(0, state => { state.players[0]!.minorHand = ['M095_FallowFields'] }, true)
    let response = succeeded(session.takeAction(0, 'meeting-place'))
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const improvement = response.interaction.request.options.find(option => option.value.startsWith('action-improvement-'))
      if (improvement) response = succeeded(session.resolveChoice(0, improvement.value))
    }
    expect(response.interaction.request.selection?.kind).toBe('farm-position')
    response = succeeded(session.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }] }))
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.cardStates[CARD_ID]?.flagged).toBe(true)
    expect(endWork(session, response).state.players[0]!.resources.food).toBe(2)
  })
})
