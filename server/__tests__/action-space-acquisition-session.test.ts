import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'

const BEAVER = 'E033_BeaverColony'
const MATTOCK = 'E077_Mattock'
const KINDLING = 'E118_KindlingGatherer'
const WORK_CERTIFICATE = 'A082_WorkCertificate'
const sessions: GameSession[] = []

afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (configure?: (state: GameState) => void, playerCount = 2, moor = false) => {
  const session = createWorkSession({ seed: 1689, options: { playerCount, enableFarmersOfTheMoor: moor }, configure: state => {
    for (const player of state.players) {
      player.resources = { ...player.resources, ...emptyResources }
      player.minorPlayed = []
      player.occupationPlayed = []
      player.improvements = []
      player.cardStates = {}
    }
    const owner = state.players[0]!
    owner.minorPlayed = [BEAVER, MATTOCK]
    owner.occupationPlayed = [KINDLING]
    owner.farmTerrain = []
    owner.pastures = [{ id: 'beaver-pasture', tiles: [{ row: 0, col: 4 }], animalType: null, animalCount: 0 }]
    owner.stableTiles = [{ row: 0, col: 4 }]
    owner.fenceSegments = [
      { edge: 'H-0-4', type: 'fence' }, { edge: 'H-1-4', type: 'fence' },
      { edge: 'V-0-4', type: 'fence' }, { edge: 'V-0-5', type: 'fence' },
    ]
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

const ok = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  return response
}

const finishAcquisitionReactions = (session: GameSession, response: SessionResponse) => {
  for (let step = 0; step < 12; step++) {
    ok(response)
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') return response
    const option = response.interaction.request.options.find(entry =>
      !entry.disabled && [BEAVER, MATTOCK, KINDLING].includes(entry.sourceCard ?? ''))
    if (!option) return response // Leave other cards' explicit decisions to their scenario.
    response = session.resolveChoice(response.interaction.playerIndex, option.value)
  }
  throw new Error('Acquisition reactions did not finish')
}

const restore = (session: GameSession) => {
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(restored)
  expect(restored.getState().interaction).toEqual(session.getState().interaction)
  expect(restored.getState().scores).toEqual(session.getState().scores)
  return restored
}

const takeCertificateReed = (session: GameSession, response: SessionResponse) => {
  ok(response)
  if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
    const certificate = response.interaction.request.options.find(option => option.sourceCard === WORK_CERTIFICATE)
    expect(certificate).toBeDefined()
    response = ok(session.resolveChoice(response.interaction.playerIndex, certificate!.value))
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected Work Certificate source choice')
  const reed = response.interaction.request.options.find(option =>
    option.labelParams?.spaceId === 'reed-bank' && option.labelParams?.resource === 'reed')
  expect(reed).toBeDefined()
  return finishAcquisitionReactions(session, ok(session.resolveChoice(response.interaction.playerIndex, reed!.value)))
}

const prepareCertificate = (state: GameState) => {
  state.players[0]!.minorPlayed.push(WORK_CERTIFICATE)
  state.players[0]!.occupationPlayed.push('A103_Portmonger', 'A092_AdoptiveParents')
  for (const space of state.actionSpaces) for (const resource of ['wood', 'clay', 'reed', 'stone'] as const) space.resources[resource] = 0
  state.actionSpaces.find(space => space.id === 'reed-bank')!.resources.reed = 4
}

const bonus = (response: SessionResponse) => response.scores?.[0]?.categories
  .find(category => category.key === 'cardBonusVp')?.entries
  .find(entry => entry.type === 'bonus' && entry.cardId === BEAVER)?.score ?? 0

const triggerCount = (response: SessionResponse, cardId: string) => response.state.log.filter(entry =>
  entry.key === 'log.cardTriggered' && entry.params?.cardId === cardId).length

describe('Action-space goods acquisition reactions', () => {
  it('rewards Work Certificate reed without using or occupying its source space', () => {
    const session = setup(prepareCertificate)
    const response = takeCertificateReed(session, ok(session.takeAction(0, 'grain-seeds')))

    expect(response.state.players[0]!.resources).toMatchObject({ grain: 1, reed: 1, clay: 1, wood: 0 })
    expect(bonus(response)).toBe(1)
    expect(triggerCount(response, BEAVER)).toBe(1)
    expect(triggerCount(response, MATTOCK)).toBe(1)
    expect(triggerCount(response, KINDLING)).toBe(0)
    const source = response.state.actionSpaces.find(space => space.id === 'reed-bank')!
    expect(source.resources.reed).toBe(3)
    expect(source.takenBy).toEqual([])
    expect(response.state.actionSpaces.find(space => space.id === 'grain-seeds')!.takenBy).toHaveLength(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { reed: 1 },
      from: { kind: 'actionSpace', spaceId: 'reed-bank' },
      to: { kind: 'player', playerId: response.state.players[0]!.id }, sourceCardId: WORK_CERTIFICATE,
    }))
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it.each([
    { players: 2, moor: true, space: 'moor-resource-market-12', choice: undefined, goods: { stone: 1, food: 1, wood: 1, clay: 1 }, vp: 0 },
    { players: 3, moor: false, space: 'resource-market', choice: 'reed', goods: { reed: 1, food: 1, wood: 1, clay: 1 }, vp: 1 },
    { players: 3, moor: false, space: 'resource-market', choice: 'stone', goods: { stone: 1, food: 1, wood: 1, clay: 1 }, vp: 0 },
    { players: 4, moor: false, space: 'resource-market-4', choice: undefined, goods: { reed: 1, stone: 1, food: 1, wood: 1, clay: 1 }, vp: 1 },
    { players: 5, moor: false, space: 'resource-market-56', choice: undefined, goods: { reed: 1, stone: 1, wood: 1, clay: 1 }, vp: 1 },
    { players: 6, moor: false, space: 'resource-market-56', choice: undefined, goods: { reed: 1, stone: 1, wood: 1, clay: 1 }, vp: 1 },
  ])('settles the three cards once for $players-player $space / $choice', ({ players, moor, space, choice, goods, vp }) => {
    const session = setup(undefined, players, moor)
    let response = ok(session.takeAction(0, space))
    if (choice) {
      const option = getChoiceOptions(response).find(entry => entry.effectPreview?.kind === 'resourceExchange'
        && (entry.effectPreview.resourcesGained?.[choice as 'reed' | 'stone'] ?? 0) > 0)
      expect(option).toBeDefined()
      response = ok(session.resolveChoice(0, option!.value))
    }
    response = finishAcquisitionReactions(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ ...emptyResources, ...goods })
    expect(bonus(response)).toBe(vp)
    expect(triggerCount(response, MATTOCK)).toBe(1)
    expect(triggerCount(response, KINDLING)).toBe(players < 5 ? 1 : 0)
    expect(response.state.actionSpaces.find(entry => entry.id === space)!.takenBy).toHaveLength(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it.each([false, true])('counts market goods and later Certificate reed independently, with original reactions first: %s', originalsFirst => {
    let session = setup(prepareCertificate, 4)
    const before = session.getState()
    const resourcesBefore = { ...before.state.players[0]!.resources }
    const scoresBefore = structuredClone(before.scores)
    const logsBefore = structuredClone(before.state.log)
    const perform = () => {
      let response = ok(session.takeAction(0, 'resource-market-4'))
      if (originalsFirst) {
        response = finishAcquisitionReactions(session, response)
        expect(response.state.players[0]!.resources).toMatchObject({ clay: 1, wood: 1 })
        expect(bonus(response)).toBe(1)
      }
      expect(getChoiceOptions(response).some(option => option.sourceCard === WORK_CERTIFICATE)).toBe(true)
      session = restore(session)
      response = takeCertificateReed(session, session.getState())
      expect(response.state.players[0]!.resources).toMatchObject({ reed: 2, stone: 1, food: 1, clay: 2, wood: 1 })
      expect(bonus(response)).toBe(2)
      expect(response.state.log.filter(entry => entry.key === 'log.cardEffectGain' && entry.params?.cardId === MATTOCK)).toHaveLength(2)
      expect(response.state.actionSpaces.find(space => space.id === 'reed-bank')!).toMatchObject({ resources: { reed: 3 }, takenBy: [] })
      expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
      session = restore(session)
      expect(session.getState().state.players[0]!.resources.clay).toBe(2)
    }
    perform()
    const undone = ok(session.undoAction())
    expect(undone.state.players[0]!.resources).toEqual(resourcesBefore)
    expect(undone.state.log).toEqual(logsBefore)
    expect(undone.scores).toEqual(scoresBefore)
    expect(undone.interaction.stateId).toBe('idle')
    perform()
  })

  it.each([KINDLING, 'A180_AnimalBrander'])('counts both Animal Brander food acquisitions with %s selected first across saved waits', firstCard => {
    const brander = 'A180_AnimalBrander'
    let session = setup(state => {
      const owner = state.players[0]!
      owner.occupationPlayed.push(brander)
      owner.pastures.push({ id: 'sheep-pasture', tiles: [{ row: 0, col: 3 }], animalType: null, animalCount: 0 })
      owner.fenceSegments.push({ edge: 'H-0-3', type: 'fence' }, { edge: 'H-1-3', type: 'fence' }, { edge: 'V-0-3', type: 'fence' })
    }, 5)
    let response = ok(session.takeAction(0, 'animal-market-56'))
    const sheep = getChoiceOptions(response).find(option => option.labelKey === 'actions.animal-market-56.option-sheep')
    expect(sheep).toBeDefined()
    response = ok(session.resolveChoice(0, sheep!.value))
    for (let step = 0; step < 24; step++) {
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind === 'confirm-next-player') break
      session = restore(session)
      response = session.getState()
      if (response.interaction.stateId !== 'wait') throw new Error('Expected saved Animal Brander interaction')
      const request = response.interaction.request
      if (request.kind === 'animal-reorg') response = ok(session.resolveChoice(0, 'confirm', {
        zones: [{ id: 'sheep-pasture', zoneType: 'pasture', animalType: 'sheep', animalCount: response.state.players[0]!.resources.sheep }],
      }))
      else if (request.kind === 'choice' || request.kind === 'select-trigger') {
        const option = request.options.find(entry => !entry.disabled && entry.sourceCard === firstCard)
          ?? request.options.find(entry => !entry.disabled && [brander, KINDLING].includes(entry.sourceCard ?? ''))
        expect(option, JSON.stringify(request)).toBeDefined()
        response = ok(session.resolveChoice(0, option!.value))
      } else throw new Error(`Unexpected Animal Brander interaction: ${request.kind}`)
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, sheep: 2, wood: 2, clay: 0, reed: 0 })
    expect(response.state.players[0]!.pastures.find(pasture => pasture.id === 'beaver-pasture')!.animalCount).toBe(0)
    expect(bonus(response)).toBe(0)
    expect(response.state.log.filter(entry => entry.key === 'log.cardEffectGain' && entry.params?.cardId === KINDLING)).toHaveLength(2)
    const foodMoves = response.state.events.filter(event => event.type === 'resource.moved'
      && event.from.kind === 'actionSpace' && (event.resources.food ?? 0) > 0)
    expect(foodMoves).toHaveLength(2)
    expect(foodMoves).toContainEqual(expect.objectContaining({ sourceCardId: brander, from: { kind: 'actionSpace', spaceId: 'animal-market-56' } }))
    expect(response.state.actionSpaces.find(space => space.id === 'animal-market-56')!.takenBy).toHaveLength(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('settles Resource Trade rewards before each later resource choice and preserves them through restore and rejected input', () => {
    let session = setup(undefined, 6)
    let response = finishAcquisitionReactions(session, ok(session.takeAction(0, 'resource-trade-6')))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1, reed: 0, clay: 0 })
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'choice' } })
    session = restore(session)
    response = session.getState()
    const reed = getChoiceOptions(response).find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.reed === 1)
    expect(reed).toBeDefined()
    response = finishAcquisitionReactions(session, ok(session.resolveChoice(0, reed!.value)))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 1, reed: 1, clay: 1 })
    expect(bonus(response)).toBe(1)
    assertRejectedUnchanged(session, () => session.resolveChoice(0, 'not-a-current-resource-option'))
    const wood = getChoiceOptions(response).find(option => option.effectPreview?.kind === 'resourceExchange'
      && option.effectPreview.resourcesGained?.wood === 1)
    expect(wood).toBeDefined()
    response = finishAcquisitionReactions(session, ok(session.resolveChoice(0, wood!.value)))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 1, wood: 2, reed: 1, clay: 1 })
    expect(triggerCount(response, KINDLING)).toBe(1)
    expect(bonus(response)).toBe(1)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('does not treat Water Worker bonus reed as an action-space acquisition', () => {
    const session = setup(state => {
      state.players[0]!.occupationPlayed.push('D144_WaterWorker')
      state.actionSpaces.find(space => space.id === 'fishing')!.resources.food = 2
    }, 3)
    let response = finishAcquisitionReactions(session, ok(session.takeAction(0, 'fishing')))
    const worker = getChoiceOptions(response).find(option => option.sourceCard === 'D144_WaterWorker')
    if (worker) response = finishAcquisitionReactions(session, ok(session.resolveChoice(0, worker.value)))
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, reed: 1, wood: 1, clay: 0 })
    expect(triggerCount(response, MATTOCK)).toBe(0)
    expect(triggerCount(response, BEAVER)).toBe(0)
    expect(triggerCount(response, KINDLING)).toBe(1)
    expect(bonus(response)).toBe(0)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it.each(['hand-only', 'opponent'])('does not reward the owner for %s acquisition', mode => {
    const session = setup(state => {
      if (mode === 'hand-only') {
        state.players[0]!.minorPlayed = []
        state.players[0]!.occupationPlayed = []
        state.players[0]!.minorHand = [BEAVER, MATTOCK]
        state.players[0]!.occupationHand = [KINDLING]
      } else state.currentPlayerIndex = 1
    }, 4)
    const actor = mode === 'opponent' ? 1 : 0
    const response = ok(session.takeAction(actor, 'resource-market-4'))
    expect(response.state.players[actor]!.resources).toMatchObject({ reed: 1, stone: 1, food: 1, wood: 0, clay: 0 })
    for (const card of [BEAVER, MATTOCK, KINDLING]) expect(triggerCount(response, card)).toBe(0)
    expect(bonus(response)).toBe(0)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('settles a named Day Laborer gain and Kindling wood before Hardworking Man builds a room', () => {
    const hardworking = 'D127_HardworkingMan'
    const session = setup(state => {
      const owner = state.players[0]!
      owner.occupationPlayed = [KINDLING, hardworking]
      owner.resources.wood = 4
      owner.resources.reed = 2
      for (const opponent of state.players.slice(1)) {
        opponent.rooms = 3
        opponent.roomTiles.push({ row: 0, col: 0 })
      }
      state.actionSpaces.push(...createPlayerActionSpaces(state))
    }, 3)
    let response = ok(session.takeAction(0, hardworking))
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const dayLaborer = response.interaction.request.options.find(option => option.labelKey === 'actions.day-laborer.name')
      if (dayLaborer) response = ok(session.resolveChoice(0, dayLaborer.value))
    }
    response = finishAcquisitionReactions(session, response)
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 5, reed: 2 })
    expect(triggerCount(response, KINDLING)).toBe(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.moved', resources: { food: 2 },
      from: { kind: 'actionSpace', spaceId: hardworking },
      to: { kind: 'player', playerId: response.state.players[0]!.id }, sourceActionId: 'gain',
    }))
    expect(response.state.actionSpaces.find(space => space.id === 'day-laborer')!.takenBy).toEqual([])
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const construct = response.interaction.request.options.find(option => option.labelKey === 'actions.construct.name')
      expect(construct).toBeDefined()
      response = ok(session.resolveChoice(0, construct!.value))
    }
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'farm-select' } })
    response = ok(session.commitSelectionChoice(0, { rooms: [{ row: 0, col: 0 }], stables: [] }))
    response = finishAcquisitionReactions(session, response)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      expect(response.interaction.request.options.some(option => option.value === '__done__')).toBe(true)
      response = ok(session.resolveChoice(0, '__done__'))
    }
    expect(response.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0, reed: 0 })
    expect(response.state.players[0]!.rooms).toBe(3)
    expect(triggerCount(response, KINDLING)).toBe(1)
    expect(bonus(response)).toBe(0)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })
})
