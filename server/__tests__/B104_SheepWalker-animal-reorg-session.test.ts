import { afterEach, describe, expect, it } from 'vitest'
import '../../shared/cards/register-all'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { cloneState } from '../../shared/session/state-bootstrap'

const B104 = 'B104_SheepWalker'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

// Issue #1118: native two-player Session coverage for payment, pending,
// batch limits and undo. Prefill is a draft, never placed-animal credit.
const setup = (placed = 1, played = true) => {
  const session = createWorkSession({ seed: 1118, configure: state => {
    state.round = 5
    state.currentPlayerIndex = 0
    for (const player of state.players) {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
      player.occupationPlayed = []
      player.minorPlayed = []
      player.improvements = []
      player.cardStates = {}
      player.pastures = []
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      Object.assign(player.resources, { sheep: 0, boar: 0, cattle: 0, stone: 0, vegetable: 0, food: 0 })
    }
    const player = state.players[0]!
    player.occupationPlayed = played ? [B104] : []
    player.improvements = ['Major_Fireplace1']
    player.resources.sheep = placed
    if (placed === 1) {
      player.houseAnimalType = 'sheep'
      player.houseAnimalCount = 1
    }
    const pastured = placed === 1 ? 0 : placed
    player.pastures = [{
      id: 'sheep-pasture', size: 1, tiles: [{ row: 0, col: 0 }], stables: 0,
      animalType: pastured > 0 ? 'sheep' : null, animalCount: pastured,
    }]
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1')
    state.actionSpaces.forEach(space => { space.takenBy = [] })
    state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
  } })
  sessions.push(session)
  return session
}

const snapshot = (response: SessionResponse): SessionResponse => ({
  ...response, state: cloneState(response.state), interaction: structuredClone(response.interaction),
})
const sheepWalkerOptions = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('expected exchange choice')
  }
  return response.interaction.request.options.filter(option => option.sourceCard === B104)
}
const recipe = (response: SessionResponse, resource: 'stone' | 'vegetable' | 'boar') => {
  const option = sheepWalkerOptions(response).find(option =>
    option.effectPreview?.kind === 'resourceExchange' && option.effectPreview.resourcesGained[resource],
  )
  if (!option) throw new Error(`missing ${resource} recipe`)
  return option.value.split(':')[1]
}
const expectOriginalReorg = (session: GameSession, response: SessionResponse, host: string | undefined, original: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
  expect(response.interaction.stateId === 'wait' && response.interaction.playerIndex).toBe(0)
  expect(session.peekEnginePendingEnvelope()?.hostNodeId).toBe(host)
  expect(response.state.actionSpaces.find(space => space.id === 'sheep-market')?.takenBy)
    .toEqual(original.state.actionSpaces.find(space => space.id === 'sheep-market')?.takenBy)
}

describe('B104 placed-sheep exchanges during animal reorganization', () => {
  it.each(['stone', 'vegetable', 'boar'] as const)('exchanges one placed sheep for %s and completes the original action', resource => {
    const session = setup()
    const original = snapshot(session.takeAction(0, 'sheep-market'))
    const host = session.peekEnginePendingEnvelope()?.hostNodeId
    expect(original.state.players[0]!.resources.sheep).toBe(2)
    expect(original.state.players[0]!.houseAnimalCount).toBe(1)
    const opened = session.takeAnytimeAction(0, 'exchange')
    expect(sheepWalkerOptions(opened).map(option => option.value.split(':')[2])).toEqual(['1', '1', '1'])
    const exchanged = session.resolveChoice(0, `bulk:${recipe(opened, resource)}=1`)
    expectOriginalReorg(session, exchanged, host, original)
    expect(exchanged.state.players[0]!.resources).toMatchObject({ sheep: 1, [resource]: 1 })
    expect(exchanged.state.players[0]!.pastures[0]!.animalCount).toBe(0)
    expect(exchanged.state.players[0]!.houseAnimalCount).toBe(0)
    expect(exchanged.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([
      expect.objectContaining({ exchangeSource: B104, times: 1, paid: { sheep: 1 }, gained: { [resource]: 1 } }),
    ])
    expect(exchanged.state.log).toContainEqual(expect.objectContaining({
      key: 'log.actionDetail', params: expect.objectContaining({ detailParts: { costs: { sheep: 1 }, gains: { [resource]: 1 } } }),
    }))
    const completed = session.resolveChoice(0, 'confirm', { zones: [
      { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 1 },
      ...(resource === 'boar' ? [{ id: 'house', zoneType: 'house', animalType: 'boar', animalCount: 1 }] : []),
    ] })
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.interaction.stateId === 'wait' && completed.interaction.request.kind).toBe('confirm-next-player')
    expect(completed.state.players[0]!.resources).toMatchObject({ sheep: 1, [resource]: 1 })
    expect(completed.state.players[0]!.pastures[0]!.animalCount).toBe(1)
    expect(completed.state.players[0]!.houseAnimalCount).toBe(resource === 'boar' ? 1 : 0)
    expect(completed.state.events.filter(event => event.type === 'resource.exchanged')).toHaveLength(1)
  })

  it.each([{ placed: 0, played: true }, { placed: 1, played: false }])('requires a played card and placed sheep (%j)', ({ placed, played }) => {
    const session = setup(placed, played)
    const original = snapshot(session.takeAction(0, 'sheep-market'))
    if (original.interaction.stateId !== 'wait' || original.interaction.request.kind !== 'animal-reorg') throw new Error('expected reorganization')
    expect(original.interaction.request.zones.some(zone => zone.animalType === 'sheep' && zone.animalCount > 0)).toBe(true)
    const opened = snapshot(session.takeAnytimeAction(0, 'exchange'))
    expect(sheepWalkerOptions(opened)).toEqual([])
    expect(session.resolveChoice(0, 'cancel').state).toEqual(original.state)
  })

  it('shares the live placed-sheep budget across mixed recipes and repeated exchange', () => {
    const session = setup(2)
    const original = snapshot(session.takeAction(0, 'sheep-market'))
    const host = session.peekEnginePendingEnvelope()?.hostNodeId
    const opened = session.takeAnytimeAction(0, 'exchange')
    const response = session.resolveChoice(0, `bulk:${recipe(opened, 'stone')}=1,${recipe(opened, 'vegetable')}=2,${recipe(opened, 'boar')}=1`)
    expectOriginalReorg(session, response, host, original)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, stone: 1, vegetable: 1, boar: 0 })
    expect(response.state.players[0]!.pastures[0]!.animalCount).toBe(0)
    expect(response.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([
      expect.objectContaining({ times: 1, paid: { sheep: 1 }, gained: { stone: 1 } }),
      expect.objectContaining({ times: 1, paid: { sheep: 1 }, gained: { vegetable: 1 } }),
    ])
    const reopened = session.takeAnytimeAction(0, 'exchange')
    expect(sheepWalkerOptions(reopened)).toEqual([])
    expect(session.resolveChoice(0, 'cancel').state).toEqual(response.state)
  })

  it.each(['0.5', '1.5', '0', '-1', 'NaN', 'Infinity', '9007199254740992'])('rejects the entire batch for invalid count %s', count => {
    const session = setup(2)
    session.takeAction(0, 'sheep-market')
    const opened = snapshot(session.takeAnytimeAction(0, 'exchange'))
    const response = session.resolveChoice(0, `bulk:${recipe(opened, 'stone')}=1,${recipe(opened, 'vegetable')}=${count}`)
    expect(response.ok).toBe(false)
    expect(response.state).toEqual(opened.state)
    expect(response.interaction).toEqual(opened.interaction)
    const valid = session.resolveChoice(0, `bulk:${recipe(opened, 'stone')}=1`)
    expect(valid.ok, valid.error).toBe(true)
    expect(valid.state.players[0]!.resources).toMatchObject({ sheep: 2, stone: 1, vegetable: 0 })
  })

  it('preserves cancellation, actor checks, cursor restoration and undo', () => {
    let session = setup()
    const original = snapshot(session.takeAction(0, 'sheep-market'))
    const host = session.peekEnginePendingEnvelope()?.hostNodeId
    const opened = snapshot(session.takeAnytimeAction(0, 'exchange'))
    const stone = recipe(opened, 'stone')
    const wrongActor = session.resolveChoice(1, `bulk:${stone}=1`)
    expect(wrongActor.ok).toBe(false)
    expect(wrongActor.state).toEqual(opened.state)
    expect(wrongActor.interaction).toEqual(opened.interaction)
    const cancelled = session.resolveChoice(0, 'cancel')
    expectOriginalReorg(session, cancelled, host, original)
    expect(cancelled.state).toEqual(original.state)
    const reopened = snapshot(session.takeAnytimeAction(0, 'exchange'))
    session = new GameSession(JSON.parse(JSON.stringify({ state: reopened.state, sessionCursor: session.createSessionPrivateCursor() })))
    sessions.push(session)
    expect(session.getState().interaction).toEqual(reopened.interaction)
    const response = session.resolveChoice(0, `bulk:${stone}=1`)
    expectOriginalReorg(session, response, host, original)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, stone: 1 })
    const undone = session.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players).toEqual(reopened.state.players)
    expect(undone.state.actionSpaces).toEqual(reopened.state.actionSpaces)
    expect(undone.state.events).toEqual(reopened.state.events)
    expect(undone.state.log).toEqual(reopened.state.log)
    expect(undone.interaction).toEqual(reopened.interaction)
    const boar = session.resolveChoice(0, `bulk:${recipe(undone, 'boar')}=1`)
    expectOriginalReorg(session, boar, host, original)
    expect(boar.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, stone: 0 })
    expect(boar.state.events.filter(event => event.type === 'resource.exchanged')).toHaveLength(1)
  })
})
