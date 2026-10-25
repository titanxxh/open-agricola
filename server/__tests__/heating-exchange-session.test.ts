import { describe, expect, it } from 'vitest'
import { createWorkSession } from './_helpers/session-fixtures'
import { restoreSession } from './_helpers/card-play-lifecycle'
import { markAllWorkersUsed } from '../../shared/domain/player'
import { emptyResources } from '../../shared/contract/state-constants'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import type { GameSession } from '../game/authoritative-session'

const wood = { sourceId: '__basic__', exchangeIndex: 2, count: 1 }
const createSession = (moor = true, firewood = false, rooms = 2) => createWorkSession({
  seed: 5401,
  options: { enableFarmersOfTheMoor: moor, allowIncompleteFarmersOfTheMoorMinorDeal: true },
  configure: state => {
    state.round = 4
    for (const space of state.actionSpaces) space.takenBy = []
    for (const player of state.players) {
      player.resources = { ...emptyResources, food: 4, fuel: 2 }
      player.improvements = []
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.fields = []
      player.pastures = []
      player.farmTerrain = []
      player.sickWorkerIds = []
    }
    const player = state.players[0]!
    Object.assign(player.resources, { wood: 1, fuel: 1 })
    player.rooms = rooms
    player.roomTiles = Array.from({ length: rooms }, (_, col) => ({ row: 2, col }))
    if (firewood) player.minorPlayed = ['M082_Firewood']
  },
})

const enterHeating = (session: GameSession) => {
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  session.loadState(session.state)
  let response = session.performRoundEnd()
  for (let step = 0; step < 8 && response.interaction.stateId === 'wait' && response.interaction.request.kind !== 'heating'; step++) {
    response = response.interaction.request.kind === 'feed'
      ? session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      : session.resolveChoice(response.interaction.playerIndex, '__skip__')
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating' } })
  return response
}

describe('heating through the shared Exchange mechanism', () => {
  it.each([true, false])('offers wood conversion only inside unified exchange when Moor is %s', moor => {
    const session = createSession(moor)
    try {
      const before = session.getState()
      expect(before.interaction.anytimeActions.some(action => action.id === 'moor-wood-to-fuel')).toBe(false)
      const opened = session.takeAnytimeAction(0, 'exchange')
      expect(opened.ok).toBe(moor)
      if (!moor) {
        expect(opened.state.players[0]!.resources).toMatchObject({ wood: 1, fuel: 1 })
        return
      }
      if (opened.interaction.stateId !== 'wait' || opened.interaction.request.kind !== 'choice') throw new Error('Expected exchange')
      const option = opened.interaction.request.options.find(option => option.sourceCard === '__basic__')
      if (!option) throw new Error('Expected wood recipe')
      const index = Number(option.value.split(':')[1])
      const converted = session.resolveChoice(0, `bulk:${index}=1`)
      expect(converted.ok, converted.error).toBe(true)
      expect(converted.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 2 })
      expect(converted.state.events).toContainEqual(expect.objectContaining({ type: 'resource.exchanged', paid: { wood: 1 }, gained: { fuel: 1 } }))
      expect(converted.state.events.filter(event => event.type === 'harvest.heated')).toEqual([])
    } finally { session.dispose() }
  })

  it('executes a heating exchange once, pays fuel, and restores the same operation after undo', () => {
    const session = createSession()
    let restored: GameSession | undefined
    try {
      const pending = enterHeating(session)
      expect(pending.state.players.map(player => player.resources.food)).toEqual([0, 4])
      const settled = session.resolveChoice(0, 'confirm', { fuelUsed: 2, selections: [wood] })
      expect(settled.ok, settled.error).toBe(true)
      expect(settled.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, fuel: 0, begging: 0 })
      expect(settled.state.players[0]!.sickWorkerIds).toEqual([])
      expect(settled.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'heating' } })
      expect(settled.state.events.filter(event => event.type === 'harvest.heated')).toEqual([
        expect.objectContaining({ required: 2, fuelUsed: 2, woodToFuel: 1, sickWorkerIds: [] }),
      ])
      expect(settled.state.log).toContainEqual(expect.objectContaining({ key: 'log.harvestHeatingDetail', params: expect.objectContaining({ fuelUsed: 2 }) }))
      const undone = session.undoStep()
      expect(undone.ok).toBe(true)
      expect(undone.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating' } })
      expect(undone.state.players[0]!.resources).toMatchObject({ wood: 1, fuel: 1, food: 0 })
      restored = restoreSession(session)
      const retried = restored.resolveChoice(0, 'confirm', { fuelUsed: 2, selections: [wood] })
      expect(retried.ok, retried.error).toBe(true)
      expect(retried.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 0, food: 0 })
      expect(retried.state.events.filter(event => event.type === 'harvest.heated')).toHaveLength(1)
      expect(retried.scores).toEqual(settled.scores)
    } finally { restored?.dispose(); session.dispose() }
  })

  it('restores a heating exchange reaction before paying fuel and never repeats the batch', () => {
    const session = createSession()
    let restored: GameSession | undefined
    try {
      const player = session.state.players[0]!
      player.occupationPlayed = ['B104_SheepWalker']
      player.minorPlayed = ['E053_BoarSpear']
      player.resources.sheep = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
      const pending = enterHeating(session)
      if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'heating') throw new Error('Expected heating')
      const walker = pending.interaction.request.exchangeCatalog.find(entry => entry.sourceId === 'B104_SheepWalker' && entry.to.boar === 1)
      if (!walker) throw new Error('Expected Sheep Walker recipe')
      const reacting = session.resolveChoice(0, 'confirm', { fuelUsed: 2, selections: [wood, {
        sourceId: walker.sourceId, exchangeIndex: walker.exchangeIndex, count: 1,
      }] })
      expect(reacting.ok, reacting.error).toBe(true)
      expect(reacting.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'E053_BoarSpear' })
      expect(reacting.state.players[0]!.resources).toMatchObject({ food: 0, fuel: 2, wood: 0, sheep: 0, boar: 1 })
      expect(reacting.state.events.filter(event => event.type === 'harvest.heated')).toEqual([])
      restored = restoreSession(session)
      const restoredPending = restored.getState()
      if (restoredPending.interaction.stateId !== 'wait' || restoredPending.interaction.request.kind !== 'choice') throw new Error('Expected Boar Spear activation')
      const activate = restoredPending.interaction.request.options.find(option => option.value !== '__skip__')
      if (!activate) throw new Error('Expected Boar Spear activation')
      const cooking = restored.resolveChoice(0, activate.value)
      if (cooking.interaction.stateId !== 'wait' || cooking.interaction.request.kind !== 'choice') throw new Error('Expected cooking choice')
      const recipe = cooking.interaction.request.options.find(option => option.sourceCard === 'E053_BoarSpear')
      if (!recipe) throw new Error('Expected boar conversion')
      const settled = restored.resolveChoice(0, `bulk:${recipe.value.split(':')[1]}=1`)
      expect(settled.ok, settled.error).toBe(true)
      expect(settled.state.players[0]!.resources).toMatchObject({ food: 4, fuel: 0, wood: 0, sheep: 0, boar: 0 })
      expect(settled.state.events.filter(event => event.type === 'harvest.heated')).toHaveLength(1)
      expect(settled.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === '__basic__')).toHaveLength(1)
      expect(settled.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'heating' } })
    } finally { restored?.dispose(); session.dispose() }
  })

  it('does not apply a wood heating discount when another recipe consumes all converted fuel', () => {
    const session = createSession(true, true)
    try {
      session.state.players[0]!.minorPlayed.push('M081_PeatBoat')
      session.state.players[0]!.resources.fuel = 2
      const pending = enterHeating(session)
      if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'heating') throw new Error('Expected heating')
      const food = pending.interaction.request.exchangeCatalog.find(entry => entry.sourceId === 'M081_PeatBoat' && entry.to.food === 1)
      if (!food) throw new Error('Expected fuel-to-food recipe')
      const settled = session.resolveChoice(0, 'confirm', { fuelUsed: 0, selections: [wood, {
        sourceId: food.sourceId, exchangeIndex: food.exchangeIndex, count: 1,
      }] })
      expect(settled.ok, settled.error).toBe(true)
      expect(settled.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 0, food: 1 })
      expect(settled.state.players[0]!.sickWorkerIds).toEqual(['2', '1'])
      expect(settled.state.events).toContainEqual(expect.objectContaining({ type: 'harvest.heated', required: 2, fuelUsed: 0, woodToFuel: 0 }))
    } finally { session.dispose() }
  })

  it.each([2, 1])('preserves Firewood discount and activation payment with %s rooms', rooms => {
    const session = createSession(true, true, rooms)
    try {
      const pending = enterHeating(session)
      expect(pending.interaction).toMatchObject({ request: { required: rooms, requiredWithWoodConversion: rooms - 1 } })
      const settled = session.resolveChoice(0, 'confirm', { fuelUsed: 1, selections: [wood] })
      expect(settled.ok, settled.error).toBe(true)
      expect(settled.state.players[0]!.resources).toMatchObject({ wood: 0, fuel: 1 })
      expect(settled.state.players[0]!.sickWorkerIds).toEqual([])
      expect(settled.state.events).toContainEqual(expect.objectContaining({ type: 'harvest.heated', required: rooms - 1, fuelUsed: 1, woodToFuel: 1 }))
    } finally { session.dispose() }
  })

  it('rejects an unaffordable batch atomically and allows voluntary underpayment', () => {
    const session = createSession()
    try {
      const pending = enterHeating(session)
      const before = captureStateWithHistory(pending.state)
      const rejected = session.resolveChoice(0, 'confirm', { fuelUsed: 2, selections: [{ ...wood, count: 2 }] })
      expect(rejected.ok).toBe(false)
      expect(captureStateWithHistory(rejected.state)).toEqual(before)
      expect(rejected.interaction).toEqual(pending.interaction)
      expect(rejected.scores).toEqual(pending.scores)
      const settled = session.resolveChoice(0, 'confirm', { fuelUsed: 0, selections: [] })
      expect(settled.ok).toBe(true)
      expect(settled.state.players[0]!.resources).toMatchObject({ wood: 1, fuel: 1 })
      expect(settled.state.players[0]!.sickWorkerIds).toEqual(['2', '1'])
      expect(settled.state.events).toContainEqual(expect.objectContaining({ type: 'harvest.heated', required: 2, fuelUsed: 0, sickWorkerIds: ['2', '1'] }))
    } finally { session.dispose() }
  })
})
