import { describe, expect, it, afterEach } from 'vitest'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setActiveWorkerCount, setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/B/B104_SheepWalker'
import '../../shared/cards/D/D124_Emissary'
import '../../shared/cards/D/D091_Plowman'
import assert from 'node:assert/strict'
import * as audit25Walker from './_helpers/audit/ae-negative-25-walker'

const B104 = 'B104_SheepWalker'
const D124 = 'D124_Emissary'
const FILLER = '__test_placeholder__'

const snapshot = (response: SessionResponse): SessionResponse => ({
  ...response, state: captureStateWithHistory(response.state), interaction: structuredClone(response.interaction),
})

const exchangeOption = (response: SessionResponse, destination: 'boar' | 'vegetable' | 'stone') => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('expected exchange choice')
  }
  const option = response.interaction.request.options.find((candidate) =>
    candidate.sourceCard === B104
    && candidate.effectPreview?.kind === 'resourceExchange'
    && (candidate.effectPreview.resourcesGained[destination] ?? 0) > 0,
  )
  expect(option).toBeDefined()
  return option!
}

const setupWorkPhase = ({ played = true, accommodated = true } = {}) => {
  return createWorkSession({ seed: 5104, configure: state => {
    state.currentPlayerIndex = 0
    state.round = 5
    state.roundPhase = 'work'
    state.players.forEach((player) => {
      setWorkersAtHome(state, player, 2)
      player.minorHand = [FILLER]
      player.occupationHand = [FILLER]
      player.resources = {
        ...player.resources,
        wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0,
        sheep: 0, boar: 0, cattle: 0,
      }
      player.pastures = []
      player.fields = []
      player.improvements = []
      player.minorPlayed = []
      player.occupationPlayed = []
      player.cardStates = {}
      player.houseAnimals = {};
    })
    state.actionSpaces.forEach((space) => { space.takenBy = [] })
    const owner = state.players[0]!
    owner.occupationHand = played ? [FILLER] : [B104]
    owner.occupationPlayed = played ? [B104] : []
    owner.resources.sheep = 1
    if (accommodated) {
      owner.pastures = [{
        id: 'sheep-pasture',
        size: 1,
        tiles: [{ row: 0, col: 0 }],
        stables: 0,
        animalType: 'sheep',
        animalCount: 1,
      }]
    }
  } })
}

const play = (session: GameSession) => {
  const response = session.takeAction(0, 'lessons')
  expect(response.ok, response.error).toBe(true)
  if (!response.state.players[0]!.occupationHand.includes(B104)) return response
  expect(response.interaction.stateId).toBe('wait')
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === B104)
  expect(option, JSON.stringify(response.interaction)).toBeDefined()
  return session.resolveChoice(response.interaction.playerIndex, option!.value)
}

describe('B104 Sheep Walker parity', () => {
  it.each([false, true])('cooks a newly exchanged animal through nested exchange and resumes both hosts (restore=%s)', (restore) => {
    let session = setupWorkPhase()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 2
    player.pastures[0]!.animalCount = 2
    player.improvements = ['Major_Fireplace1']
    state.availableMajorImprovements = state.availableMajorImprovements.filter((id) => id !== 'Major_Fireplace1')
    session.loadState(state)
    const parent = snapshot(session.takeAction(0, 'farmland'))
    const parentHost = session.peekEnginePendingEnvelope()?.hostNodeId
    const choice = session.takeAnytimeAction(0, 'exchange')
    const reorg = snapshot(session.resolveChoice(0, `bulk:${exchangeOption(choice, 'boar').value.split(':')[1]}=1`))
    const reorgHost = session.peekEnginePendingEnvelope()?.hostNodeId
    expect(reorg.ok, reorg.error).toBe(true)
    expect(reorg.interaction.stateId === 'wait' && reorg.interaction.request.kind).toBe('animal-reorg')
    expect(reorg.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 1, food: 0 })
    expect(reorg.state.players[0]!).toMatchObject({ houseAnimals: {}, })
    if (reorg.interaction.stateId !== 'wait' || reorg.interaction.request.kind !== 'animal-reorg') throw new Error('expected reorganization')
    expect(reorg.interaction.request.zones.find((zone) => zone.zoneType === 'house'))
      .toMatchObject({ animalType: 'boar', animalCount: 1 })
    expect(reorg.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')

    let nested = session.takeAnytimeAction(0, 'exchange')
    expect(nested.ok, nested.error).toBe(true)
    if (restore) {
      session = new GameSession(JSON.parse(JSON.stringify({
        state: nested.state,
        sessionCursor: session.createSessionPrivateCursor(),
      })))
      expect(session.getState().interaction).toEqual(nested.interaction)
      nested = session.getState()
    }
    if (nested.interaction.stateId !== 'wait' || nested.interaction.request.kind !== 'choice') throw new Error('expected nested exchange')
    expect(nested.interaction.request.options.filter((option) => option.sourceCard === B104)).toHaveLength(3)
    const cooking = nested.interaction.request.options.find((option) =>
      option.sourceCard === 'Major_Fireplace1'
      && option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesPaid.boar === 1,
    )
    expect(cooking).toBeDefined()
    const cooked = session.resolveChoice(0, cooking!.value)
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0, food: 2 })
    if (cooked.interaction.stateId !== 'wait' || cooked.interaction.request.kind !== 'animal-reorg') throw new Error('expected reorganization')
    // Cooking changes inventory, so the same pending host refreshes its draft.
    expect(cooked.interaction.request).toEqual({
      ...reorg.interaction.request,
      zones: reorg.interaction.request.zones.map((zone) => zone.zoneType === 'house'
        ? { ...zone, animalType: null, animalCount: 0 }
        : zone),
    })
    expect(cooked.state.players[0]!).toMatchObject({ houseAnimals: {}, })
    expect(cooked.interaction.playerIndex).toBe(0)
    expect(session.peekEnginePendingEnvelope()?.hostNodeId).toBe(reorgHost)
    const resumed = session.resolveChoice(0, 'confirm', { zones: cooked.interaction.request.zones })
    expect(resumed.ok, resumed.error).toBe(true)
    if (resumed.interaction.stateId !== 'wait' || parent.interaction.stateId !== 'wait') throw new Error('expected plow')
    expect(resumed.interaction.request).toEqual(parent.interaction.request)
    expect(session.peekEnginePendingEnvelope()?.hostNodeId).toBe(parentHost)
    expect(resumed.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
      .toEqual(parent.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
    const completed = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(completed.ok, completed.error).toBe(true)
    expect(completed.state.players[0]!.fields).toHaveLength(1)
    expect(completed.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0, food: 2 })
    const exchanges = completed.state.events.filter((event) => event.type === 'resource.exchanged')
    expect(exchanges).toHaveLength(2)
    expect(exchanges).toEqual(expect.arrayContaining([
      expect.objectContaining({ exchangeSource: B104, times: 1, paid: { sheep: 1 }, gained: { boar: 1 } }),
      expect.objectContaining({ exchangeSource: 'Major_Fireplace1', times: 1, paid: { boar: 1 }, gained: { food: 2 } }),
    ]))
  })

  it.each([{ boar: 2, vegetable: 0 }, { boar: 1, vegetable: 1 }])('settles a whole batch %j before reorganizing and resuming plow', (gained) => {
    const session = setupWorkPhase()
    const state = session.getState().state
    const player = state.players[0]!
    player.resources.sheep = 2
    player.pastures[0]!.animalCount = 2
    player.resources.cattle = 1
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'cattle']));
    session.loadState(state)
    const before = session.takeAction(0, 'farmland')
    expect(before.interaction.stateId === 'wait' && before.interaction.request.kind).toBe('farm-select')
    const choice = session.takeAnytimeAction(0, 'exchange')
    const entries = [`${exchangeOption(choice, 'boar').value.split(':')[1]}=${gained.boar}`]
    if (gained.vegetable) entries.push(`${exchangeOption(choice, 'vegetable').value.split(':')[1]}=1`)
    let response = session.resolveChoice(0, `bulk:${entries.join(',')}`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 1, ...gained })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    response = session.resolveChoice(0, 'confirm', { zones: [
      { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: gained.boar },
      { id: 'house:1-0', zoneType: 'house', animalType: 'cattle', animalCount: 1 },
    ] })
    expect(response.ok, response.error).toBe(true)
    if (before.interaction.stateId !== 'wait' || response.interaction.stateId !== 'wait') throw new Error('expected plow')
    expect(response.interaction.request).toEqual(before.interaction.request)
    expect(response.interaction.playerIndex).toBe(0)
    expect(response.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'boar', animalCount: gained.boar })
    expect(response.state.players[0]!).toMatchObject({ houseAnimals: { '1-0': 'cattle' }, })
    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, cattle: 1, ...gained })
    const exchanged = response.state.events.filter((event) => event.type === 'resource.exchanged')
    expect(exchanged).toHaveLength(gained.vegetable ? 2 : 1)
    expect(exchanged[0]).toMatchObject({ exchangeSource: B104, times: gained.boar, paid: { sheep: gained.boar }, gained: { boar: gained.boar } })
  })

  it('offers Sheep Walker recipes through the shared exchange entry', () => {
    const session = setupWorkPhase()
    const before = snapshot(session.getState())
    expect(before.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
    expect(before.interaction.anytimeActions.some((action) => action.id.startsWith('B104-sheep-walker-'))).toBe(false)

    const choice = session.takeAnytimeAction(0, 'exchange')
    expect(choice.state.players[0]!.resources.sheep).toBe(1)
    const response = session.resolveChoice(0, exchangeOption(choice, 'stone').value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, stone: 1 })
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.exchanged', exchangeSource: B104, times: 1, paid: { sheep: 1 }, gained: { stone: 1 },
    }))
  })

  it('B104 S1: playing Sheep Walker through Lessons leaves it in play', () => {
    const response = play(setupWorkPhase({ played: false, accommodated: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(B104)
  })

  for (const [scenario, destination] of [
    ['S2', 'boar'],
    ['S3', 'vegetable'],
    ['S4', 'stone'],
  ] as const) {
    it(`B104 ${scenario}: an accommodated sheep can be exchanged for one ${destination}`, () => {
      const session = setupWorkPhase()

      const choice = session.takeAnytimeAction(0, 'exchange')
      let response = session.resolveChoice(0, exchangeOption(choice, destination).value)

      expect(response.ok, response.error).toBe(true)
      if (destination === 'boar') {
        expect(response.interaction.stateId).toBe('wait')
        if (response.interaction.stateId !== 'wait') throw new Error('expected animal reorganization')
        expect(response.interaction.request.kind).toBe('animal-reorg')
        response = session.resolveChoice(0, 'confirm', {
          zones: [{
            id: 'sheep-pasture',
            zoneType: 'pasture',
            animalType: 'boar',
            animalCount: 1,
          }],
        })
      }
      expect(response.ok, response.error).toBe(true)
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).not.toBe('animal-reorg')
      expect(response.state.players[0]!.resources.sheep).toBe(0)
      expect(response.state.players[0]!.resources[destination]).toBe(1)
    })
  }

  it.each(['unplaced', 'absent', 'no-sheep'])('rejects unavailable recipes: %s', (reason) => {
    const session = setupWorkPhase({ played: reason !== 'absent', accommodated: reason !== 'unplaced' })
    if (reason === 'no-sheep') {
      const state = session.getState().state
      state.players[0]!.resources.sheep = 0
      state.players[0]!.pastures = []
      session.loadState(state)
    }
    const before = snapshot(session.getState())
    expect(before.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')
    for (const actionId of ['exchange', ...['boar', 'vegetable', 'stone'].map((to) => `B104-sheep-walker-${to}`)]) {
      const response = session.takeAnytimeAction(0, actionId)
      expect(response.ok).toBe(false)
      expect(snapshot(response).state).toEqual(before.state)
      expect(response.interaction).toEqual(before.interaction)
    }
  })

  it('caps a mixed batch at placed sheep and does not consume one sheep twice', () => {
    const session = setupWorkPhase()
    const state = session.getState().state
    state.players[0]!.resources.sheep = 3
    state.players[0]!.pastures[0]!.animalCount = 2
    session.loadState(state)
    const choice = session.takeAnytimeAction(0, 'exchange')
    const stone = exchangeOption(choice, 'stone')
    const vegetable = exchangeOption(choice, 'vegetable')
    expect(stone.value.split(':')[2]).toBe('2')
    const response = session.resolveChoice(0, `bulk:${stone.value.split(':')[1]}=1,${vegetable.value.split(':')[1]}=5`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, stone: 1, vegetable: 1 })
  })

  it('preserves the plow owner and worker through rejection, cancellation and undo', () => {
    const session = setupWorkPhase()
    const parent = snapshot(session.takeAction(0, 'farmland'))
    const choice = snapshot(session.takeAnytimeAction(0, 'exchange'))
    const rejected = session.resolveChoice(1, exchangeOption(choice, 'stone').value)
    expect(rejected.ok).toBe(false)
    expect(snapshot(rejected).state).toEqual(choice.state)
    expect(rejected.interaction).toEqual(choice.interaction)
    const cancelled = session.resolveChoice(0, 'cancel')
    expect(cancelled.ok, cancelled.error).toBe(true)
    expect(cancelled.interaction).toEqual(parent.interaction)
    expect(cancelled.state.players[0]!.resources).toEqual(parent.state.players[0]!.resources)
    const reopened = session.takeAnytimeAction(0, 'exchange')
    let response = session.resolveChoice(0, exchangeOption(reopened, 'boar').value)
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    response = session.undoStep()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual(parent.state.players[0]!.resources)
    expect(response.state.players[0]!.pastures).toEqual(parent.state.players[0]!.pastures)
    expect(response.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
      .toEqual(parent.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
    response = session.resolveChoice(0, exchangeOption(response, 'stone').value)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, stone: 1, boar: 0 })
    if (response.interaction.stateId !== 'wait' || parent.interaction.stateId !== 'wait') throw new Error('expected plow')
    expect(response.interaction.request).toEqual(parent.interaction.request)
    expect(response.interaction.playerIndex).toBe(parent.interaction.playerIndex)
  })

  it('does not offer exchange during the next-player confirmation', () => {
    const session = setupWorkPhase()
    const response = session.takeAction(0, 'forest')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('confirm-next-player')
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')
    expect(session.takeAnytimeAction(0, 'exchange').ok).toBe(false)
  })

  it('offers exchange before a real Plowman action matures', () => {
    const session = setupWorkPhase()
    const state = session.getState().state
    state.players.forEach((player, index) => {
      markAllWorkersUsed(state, player)
      player.startPlayer = index === 0
    })
    const player = state.players[0]!
    player.occupationPlayed.push('D091_Plowman')
    player.resources.food = 1
    player.pastures = []
    player.houseAnimals = Object.fromEntries(player.roomTiles.slice(0, 1).map(tile => [`${tile.row}-${tile.col}`, 'sheep']));
    state.futureMeeples = [6, 9, 12].map((round) => ({
      id: `D091_Plowman-${player.id}-${round}-0`, cardId: 'D091_Plowman', playerId: player.id,
      round, actionId: state.roundActionOrder[round - 1] ?? null,
      resources: { field: 1 }, actionContext: { exactCost: { food: 1 } },
    }))
    session.loadState(state)
    let response = session.performRoundEnd()
    expect(response.state.round).toBe(6)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') throw new Error('expected preparation')
    const exchange = response.interaction.request.options.find((option) => option.labelKey === 'actions.exchange.name')
    expect(exchange).toBeDefined()
    response = session.resolveChoice(0, exchange!.value)
    response = session.resolveChoice(0, exchangeOption(response, 'stone').value)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, stone: 1, food: 1 })
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') throw new Error('expected Plowman')
    const accept = response.interaction.request.options.find((option) => !option.disabled && option.sourceCard === 'D091_Plowman')!
    response = session.resolveChoice(0, accept.value)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') throw new Error('expected plow')
    response = session.commitSelectionChoice(0, { tile: response.interaction.request.farm.selectableTiles[0]! })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 0, stone: 1, food: 0 })
    expect(response.state.players[0]!.fields).toHaveLength(1)
    expect(response.state.futureMeeples.filter((entry) => entry.cardId === 'D091_Plowman').map((entry) => entry.round)).toEqual([9, 12])
  })
})

const setupRound14 = (sheep: number) => {
  const session = setupWorkPhase()
  const state = session.getState().state
  state.round = 14
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 10
  })
  const player = state.players[0]!
  player.startPlayer = true
  player.occupationPlayed = [B104, D124]
  player.resources.sheep = sheep
  player.resources.wood = 1
  player.pastures = [{
    id: 'sheep-pasture',
    tiles: [{ row: 0, col: 0 }, { row: 0, col: 1 }],
    animalType: 'sheep',
    animalCount: sheep,
  }]
  player.fenceSegments = ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'].map(edge => ({
    edge, type: 'fence', source: { kind: 'own', ownerPlayerId: player.id },
  }))
  state.players[1]!.startPlayer = false
  setActiveWorkerCount(state.players[1]!, 0)
  session.loadState(state)
  return session
}

const passFeed = (session: GameSession) => {
  let response = session.performRoundEnd()
  if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
    response = session.resolveChoice(0, '__skip__')
  }
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'feed') {
    response = session.resolveChoice(0, 'confirm', { selections: [] })
  }
  return response
}

describe('B104 Sheep Walker anytime timing', () => {
  it.each(['boar', 'vegetable', 'stone'] as const)('retains harvest recipe order and settles %s before scoring', (destination) => {
    const session = setupRound14(1)
    const state = session.getState().state
    state.players[0]!.resources.food = 0
    session.loadState(state)
    let response = session.performRoundEnd()
    if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') response = session.resolveChoice(0, '__skip__')
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('feed')
    response = session.resolveChoice(0, 'confirm', { selections: [{
      sourceId: B104, exchangeIndex: ['boar', 'vegetable', 'stone'].indexOf(destination), count: 1,
    }] })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.sheep).toBe(0)
    expect(response.state.players[0]!.resources[destination]).toBe(1)
    if (destination === 'boar') {
      expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
      response = session.resolveChoice(0, 'confirm', { zones: [{ id: 'sheep-pasture', zoneType: 'pasture', animalType: 'boar', animalCount: 1 }] })
    }
    response = session.resolveChoice(0, '__skip__')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.gameOver).toBe(true)
    expect(response.scores).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'harvest.feedConverted', source: B104, cost: { sheep: 1 }, food: { [destination]: 1 },
    }))
  })

  it('offers placed-sheep non-food recipes during final breeding reorganization without cooking', () => {
    const session = setupRound14(2)
    const state = session.getState().state
    state.players[0]!.improvements = ['Major_Fireplace1']
    state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1')
    session.loadState(state)
    const before = snapshot(passFeed(session))
    expect(before.interaction.stateId === 'wait' && before.interaction.request.kind).toBe('animal-reorg')
    const choice = session.takeAnytimeAction(0, 'exchange')
    expect(choice.ok, choice.error).toBe(true)
    if (choice.interaction.stateId !== 'wait' || choice.interaction.request.kind !== 'choice') {
      throw new Error('expected exchange choice')
    }
    expect(choice.interaction.request.options.filter((option) => option.sourceCard === B104)).toHaveLength(3)
    expect(choice.interaction.request.options.some((option) => option.sourceCard === 'Major_Fireplace1')).toBe(false)
    const response = session.resolveChoice(0, `bulk:${exchangeOption(choice, 'stone').value.split(':')[1]}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(before.state.players[0]!.resources.sheep).toBe(3)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, stone: 1, food: 8 })
    expect(response.interaction.stateId === 'wait' && response.interaction.request.kind).toBe('animal-reorg')
    expect(response.interaction.stateId === 'wait' && response.interaction.playerIndex).toBe(0)
    const housed = session.resolveChoice(0, 'confirm', {
      zones: [{ id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 }],
    })
    expect(housed.ok, housed.error).toBe(true)
    expect(housed.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    const scored = session.resolveChoice(0, '__skip__')
    expect(scored.ok, scored.error).toBe(true)
    expect(scored.state.gameOver).toBe(true)
    expect(scored.scores).toHaveLength(2)
  })

  it('uses only the default exchange windows and retains Emissary before scoring', () => {
    const session = setupRound14(1)
    let response = snapshot(passFeed(session))

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected pre-scoring window')
    expect(response.interaction.request.kind).toBe('choice')
    if (response.interaction.request.kind !== 'choice') throw new Error('expected choice')
    expect(response.interaction.request.options.some((option) => option.sourceCard === B104)).toBe(false)
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')
    expect(response.interaction.request.options.some((option) => option.sourceCard === D124)).toBe(true)

    response = session.resolveChoice(0, '__skip__')
    expect(response.state.gameOver).toBe(true)
    expect(response.scores).toHaveLength(2)
  })

  it('B104 S7: exchanges placed sheep in final breeding reorganization without adding a pre-scoring window', () => {
    const session = setupRound14(2)
    let response = snapshot(passFeed(session))

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected reorganization')
    expect(response.interaction.request.kind).toBe('animal-reorg')
    expect(response.interaction.anytimeActions.map((action) => action.id).some((id) =>
      id.startsWith('B104-sheep-walker-') || id.startsWith('D124-emissary-'),
    )).toBe(false)
    expect(response.interaction.anytimeActions.map((action) => action.id)).toContain('exchange')
    const rejected = session.takeAnytimeAction(0, 'D124-emissary-anytime')
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(response.interaction)
    expect(snapshot(rejected).state).toEqual(response.state)
    const host = session.peekEnginePendingEnvelope()?.hostNodeId
    response = session.takeAnytimeAction(0, 'exchange')
    response = session.resolveChoice(0, `bulk:${exchangeOption(response, 'stone').value.split(':')[1]}=1`)
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, stone: 1 })
    expect(session.peekEnginePendingEnvelope()?.hostNodeId).toBe(host)

    response = session.resolveChoice(0, 'confirm', [
      { id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: 2 },
    ])

    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') throw new Error('expected pre-scoring window')
    expect(response.interaction.request.kind).toBe('choice')
    if (response.interaction.request.kind !== 'choice') throw new Error('expected choice')
    expect(response.interaction.request.options.some((option) => option.sourceCard === B104)).toBe(false)
    expect(response.interaction.request.options.some((option) => option.sourceCard === D124)).toBe(true)
    expect(response.interaction.anytimeActions.map((action) => action.id)).not.toContain('exchange')
    response = session.resolveChoice(0, '__skip__')
    expect(response.state.gameOver).toBe(true)
    expect(response.scores).toHaveLength(2)
  })
})

describe('ae-negative-25-walker', () => {
  const { sessions, save, ok, ready, finish, make, exchangeMenu, index, trade } = audit25Walker
  afterEach(()=>sessions.splice(0).forEach(s=>s.dispose()))
  it('B104 N1 actual anytime exchange consumes exactly one farmyard sheep for one selected pig vegetable or stone',()=>{for(const type of['boar','vegetable','stone']as const){const s=make(),a=trade(s,type);assert.equal(a.r.state.players[0]!.resources.sheep,0);assert.equal(a.r.state.players[0]!.resources[type],1);assert.equal(a.r.state.players[0]!.resources.food,100);assert.equal(a.r.state.players[1]!.resources[type],0);if(type==='boar')assert.equal(a.r.state.players[0]!.pastures[0]!.animalType,'boar');save(`B104-N1-${type}`,a)}})
  it('B104 N2 unknown trade changes no goods and over-request consumes at most the one available sheep before separate legal control',()=>{const s=make(),pending=exchangeMenu(s),n=index(pending,'stone'),unknown=JSON.parse(JSON.stringify(s.resolveChoice(0,'bulk:99999=1'))) as SessionResponse;save('B104-N2-unknown',{pending,unknown});assert.equal(unknown.ok,false);assert.equal(unknown.error,'log.actionNoExchange');assert.deepEqual(unknown.state,pending.state);assert.deepEqual(unknown.scores,pending.scores);assert.ok(unknown.interaction.stateId==='wait'&&pending.interaction.stateId==='wait');assert.deepEqual(unknown.interaction.request,pending.interaction.request);assert.equal(unknown.state.players[0]!.resources.sheep,1);assert.equal(unknown.state.players[0]!.resources.stone,0);assert.ok(unknown.interaction.stateId==='wait'&&unknown.interaction.request.kind==='choice');const over=ok(s.resolveChoice(0,`bulk:${n}=2`));assert.equal(over.state.players[0]!.resources.sheep,0);assert.equal(over.state.players[0]!.resources.stone,1);const control=make(),legal=trade(control,'stone');assert.equal(legal.r.state.players[0]!.resources.sheep,0);assert.equal(legal.r.state.players[0]!.resources.stone,1);save('B104-N2',{pending,unknown,over,legal})})
  it('B104 N3 card in hand or no owned farmyard sheep exposes no Sheep Walker exchange',()=>{for(const mode of['hand','zero']){const s=make(mode!=='hand',mode==='zero'?0:1),r=ok(s.getState());const action=s.takeAnytimeAction(0,'exchange');if(action.ok){assert.ok(action.interaction.stateId==='wait'&&action.interaction.request.kind==='choice');assert.ok(action.interaction.request.options.every(o=>o.effectPreview?.kind!=='resourceExchange'||o.effectPreview.resourcesPaid?.sheep!==1))}else assert.equal(action.ok,false);save(`B104-N3-${mode}`,{r,action})}})
  it('B104 N4 actual Lessons with anytime exchange supports whole action undo of sheep stone and occupation',()=>{const s=make();ready(s);const pending=ok(s.takeAction(0,'lessons')),a=trade(s,'stone'),r=finish(s,ok(s.resolveChoice(0,'A110_Roughcaster')),false),undone=ok(s.undoAction());assert.equal(r.state.players[0]!.resources.stone,1);assert.equal(undone.state.players[0]!.resources.stone,0);assert.equal(undone.state.players[0]!.resources.sheep,1);assert.ok(undone.state.players[0]!.occupationHand.includes('A110_Roughcaster'));save('B104-N4',{pending,a,r,undone})})
})
