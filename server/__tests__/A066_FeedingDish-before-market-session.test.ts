import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { positionKey } from '../../shared/domain/farm'
import { serializeSessionSnapshot, rehydrateState } from '../../shared/session/serialization'
import type { GameState, PlayerState } from '../../shared/contract/types'

/**
 * Confirmed #1131 boundary: actual animal-market use automatically checks live
 * ownership and grants grain before the collect reaction menu. Cooking in that
 * later menu preserves the reward; cooking before market use prevents it. Real 2-player
 * seed-42 work sessions start in round 8, fixed placeholder hands, two rooms,
 * food 20 and grain 0. Each scenario prepares actual animal placements before
 * loading, then uses takeAction/resolveChoice and generic anytime exchange.
 * Assertions cover immediate resources, pending, authoritative events, logs,
 * scores, ownership, cooking order, snapshot restoration and undo/retry.
 */
const CARD = 'A066_FeedingDish'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

function setup(configure?: (state: GameState) => void, moor = false) {
  const session = createWorkSession({ seed: 42, options: { playerCount: 2, enableFarmersOfTheMoor: moor }, configure(state) {
    state.round = 8
    for (const player of state.players) { player.resources.food = 20; player.farmTerrain = [] }
    const player = state.players[0]!
    player.minorPlayed = [CARD]
    player.resources.grain = 0
    for (const spaceId of ['sheep-market', 'pig-market', 'cattle-market']) {
      const space = state.actionSpaces.find(space => space.id === spaceId)!
      Object.assign(space.resources, { sheep: 0, boar: 0, cattle: 0 })
      const animal = spaceId === 'sheep-market' ? 'sheep' : spaceId === 'pig-market' ? 'boar' : 'cattle'
      space.resources[animal] = 1
    }
    configure?.(state)
  } })
  sessions.push(session)
  return session
}

function settle(session: GameSession, response: SessionResponse): SessionResponse {
  for (let step = 0; response.interaction.stateId === 'wait' && step < 12; step++) {
    const { request, playerIndex } = response.interaction
    if (request.kind === 'animal-reorg') {
      response = session.resolveChoice(playerIndex, 'confirm', { zones: request.zones.map(zone => ({
        id: zone.id, zoneType: zone.zoneType, animalType: zone.animalType, animalCount: zone.animalCount,
      })) })
    } else if (request.kind === 'select-trigger' || request.kind === 'choice') {
      const available = request.options.filter(option => !('disabled' in option && option.disabled === true))
      const option = available.find(option => option.value === '__pass__' || option.value === '__skip__') ?? available[0]
      if (!option) throw new Error('No available reaction choice')
      response = session.resolveChoice(playerIndex, option.value)
    } else break
    expect(response.ok, response.error).toBe(true)
  }
  return response
}

const grainEvents = (response: SessionResponse) => response.state.events.filter(event =>
  event.type === 'resource.moved' && event.sourceCardId === CARD && (event.resources.grain ?? 0) > 0,
)

type Animal = 'sheep' | 'boar' | 'cattle'
const markets = [
  { animal: 'sheep', space: 'sheep-market', score: 2, category: 'sheeps' },
  { animal: 'boar', space: 'pig-market', score: 2, category: 'boars' },
  { animal: 'cattle', space: 'cattle-market', score: 3, category: 'cattles' },
] satisfies Array<{ animal: Animal; space: string; score: number; category: string }>

function pasture(player: PlayerState, animal: Animal | null = null, count = 0) {
  player.pastures = [{ id: 'pen', tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], animalType: animal, animalCount: count }]
  if (animal) player.resources[animal] = count
}

function beforeChoices(session: GameSession) {
  const response = session.takeAction(0, 'sheep-market')
  expect(response.ok).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'select-trigger') throw new Error('Expected before reactions')
  expect(response.interaction.request.options.map(option => option.sourceCard)).not.toContain(CARD)
  expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1 })
  return response
}

function cookSheep(session: GameSession) {
  const response = session.takeAnytimeAction(0, 'exchange')
  expect(response.ok).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') throw new Error('Expected exchange recipes')
  const option = response.interaction.request.options.find(option => option.effectPreview?.kind === 'resourceExchange'
    && option.effectPreview.resourcesPaid?.sheep === 1)
  if (!option) throw new Error('Expected sheep cooking')
  const cooked = session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=1`)
  expect(cooked.ok, cooked.error).toBe(true)
  expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 22 })
  expect(cooked.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(1)
  return cooked
}

function orderedSetup() {
  return setup(state => {
    const player = state.players[0]!
    pasture(player, 'sheep', 1)
    player.minorPlayed.push('A017_ReclamationPlow', 'B034_SpecialFood')
    player.improvements = ['Major_Fireplace1']
  })
}

describe('A066 Feeding Dish ownership before actual market use', () => {
  it.each(markets)('does not qualify from the $animal just collected', ({ animal, space }) => {
    const session = setup()
    const response = settle(session, session.takeAction(0, space))
    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources[animal]).toBe(1)
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(grainEvents(response)).toEqual([])
  })

  it.each(markets)('grants exactly one grain before collecting three $animal and preserves animal scoring', ({ animal, space, score, category }) => {
    const session = setup(state => {
      pasture(state.players[0]!, animal, 1)
      state.actionSpaces.find(entry => entry.id === space)!.resources[animal] = 3
    })
    const pending = session.takeAction(0, space)
    expect(pending.ok).toBe(true)
    expect(pending.state.players[0]!.resources).toMatchObject({ [animal]: 4, grain: 1 })
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    const response = settle(session, pending)
    expect(response.state.players[0]!.resources).toMatchObject({ [animal]: 4, grain: 1 })
    expect(grainEvents(response)).toHaveLength(1)
    const reward = response.state.events.findIndex(event => event.type === 'resource.moved' && event.sourceCardId === CARD)
    const collected = response.state.events.findIndex(event => event.type === 'resource.moved' && event.from.kind === 'actionSpace' && event.from.spaceId === space)
    expect(reward).toBeGreaterThanOrEqual(0)
    expect(collected).toBeGreaterThan(reward)
    expect(response.scores?.[0]?.categories.find(entry => entry.key === category)).toMatchObject({ quantity: 4, total: score })
    expect(response.state.log.some(entry => entry.key === 'log.reorganizeFail')).toBe(false)
  })

  it.each(['room', 'stable', 'card'] as const)('counts a previously owned sheep in a %s holder', storage => {
    const session = setup(state => {
      const player = state.players[0]!
      pasture(player)
      player.resources.sheep = 1
      if (storage === 'room') { player.houseAnimals = { [positionKey(player.roomTiles[0]!)]: 'sheep' } }
      if (storage === 'stable') { player.stableTiles = [{ row: 0, col: 2 }]; player.stableAnimals = { '0-2': 'sheep' } }
      if (storage === 'card') {
        player.occupationPlayed = ['D148_DomesticianExpert']
        player.cardStates.D148_DomesticianExpert = { extraData: { animalType: 'sheep', held: 1 } }
      }
    })
    const response = settle(session, session.takeAction(0, 'sheep-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(grainEvents(response)).toHaveLength(1)
  })

  it.each(['p1', 'p2'] as const)('uses actual ownership for an animal hosted on the opponent card (%s)', animalOwner => {
    const session = setup(state => {
      const owner = state.players[1]!
      owner.minorPlayed = ['M033_NightPasture']
      owner.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: {
        [`card:M033_NightPasture:owner:p2:animalOwner:${animalOwner}`]: { animalCounts: { sheep: 1 }, animalOwnerPlayerId: animalOwner },
      } } }
      state.players[animalOwner === 'p1' ? 0 : 1]!.resources.sheep = 1
      pasture(state.players[0]!)
    }, true)
    const response = settle(session, session.takeAction(0, 'sheep-market'))
    expect(response.state.players[0]!.resources.grain).toBe(animalOwner === 'p1' ? 1 : 0)
    expect(grainEvents(response)).toHaveLength(animalOwner === 'p1' ? 1 : 0)
    expect(response.state.players[1]!.resources.grain).toBe(0)
  })

  it('does not qualify from a guest animal hosted on the acting player card', () => {
    const session = setup(state => {
      const owner = state.players[0]!
      owner.minorPlayed.push('M033_NightPasture')
      owner.cardStates.M033_NightPasture = { extraData: { animalCountsByZone: {
        'card:M033_NightPasture:owner:p1:animalOwner:p2': { animalCounts: { sheep: 1 }, animalOwnerPlayerId: 'p2' },
      } } }
      state.players[1]!.resources.sheep = 1
    }, true)
    const response = settle(session, session.takeAction(0, 'sheep-market'))
    expect(response.state.players[0]!.resources.grain).toBe(0)
    expect(grainEvents(response)).toEqual([])
  })

  it('does not qualify from a different species or an unassigned inventory animal', () => {
    for (const assigned of [true, false]) {
      const session = setup(state => {
        if (assigned) pasture(state.players[0]!, 'boar', 1)
        else state.players[0]!.resources.sheep = 1
      })
      const response = settle(session, session.takeAction(0, 'sheep-market'))
      expect(response.state.players[0]!.resources.grain).toBe(0)
      expect(grainEvents(response)).toEqual([])
    }
  })

  it('does not react without the card or to another player collection', () => {
    for (const actor of [0, 1]) {
      const session = setup(state => {
        pasture(state.players[0]!, 'sheep', 1)
        if (actor === 0) state.players[0]!.minorPlayed = []
        else state.currentPlayerIndex = 1
      })
      const response = settle(session, session.takeAction(actor, 'sheep-market'))
      expect(response.state.players[0]!.resources.grain).toBe(0)
      expect(grainEvents(response)).toEqual([])
    }
  })

  it('does not react to non-animal collection or a non-collect source', () => {
    for (const action of ['forest', 'day-laborer']) {
      const session = setup(state => { pasture(state.players[0]!, 'sheep', 1) })
      const response = settle(session, session.takeAction(0, action))
      expect(response.ok).toBe(true)
      expect(response.state.players[0]!.resources.grain).toBe(0)
      expect(grainEvents(response)).toEqual([])
    }
  })

  it('awards grain before the collect menu and retains it when the last old sheep is cooked there', () => {
    const session = orderedSetup()
    beforeChoices(session)
    const cooked = cookSheep(session)
    expect(cooked.state.players[0]!.resources.grain).toBe(1)
    const response = settle(session, cooked)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1, food: 22 })
    expect(grainEvents(response)).toHaveLength(1)
  })

  it('restores the collect menu after cooking without repeating or withdrawing the prior award', () => {
    const session = orderedSetup()
    beforeChoices(session)
    cookSheep(session)
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))))
    sessions.push(restored)
    const pending = restored.getState()
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    expect(pending.state.players[0]!.resources).toMatchObject({ sheep: 0, grain: 1, food: 22 })
    const response = settle(restored, pending)
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 1, food: 22 })
    expect(grainEvents(response)).toHaveLength(1)
  })

  it.each([CARD, 'never-issued-listener'])('rejects a never-issued reaction value %s', choice => {
    const session = setup(state => { state.players[0]!.minorPlayed.push('A017_ReclamationPlow', 'B034_SpecialFood') })
    const pending = session.takeAction(0, 'sheep-market')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'select-trigger') throw new Error('Expected before menu')
    expect(pending.interaction.request.options.some(option => option.sourceCard === CARD)).toBe(false)
    const forged = session.resolveChoice(0, choice)
    expect(forged.ok).toBe(false)
    expect(forged.state).toEqual(pending.state)
    expect(forged.state.players[0]!.resources).toMatchObject({ sheep: 0, grain: 0 })
    expect(forged.state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep).toBe(1)
    expect(grainEvents(forged)).toEqual([])
  })

  it('rejects a disabled before reaction without granting its effect or taking the host resources', () => {
    const session = setup(state => {
      const player = state.players[0]!
      player.resources.food = 0
      player.occupationPlayed = ['A091_ShiftingCultivator']
      player.minorPlayed.push('B034_SpecialFood')
    })
    const pending = session.takeAction(0, 'forest')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'select-trigger') throw new Error('Expected before menu')
    expect(pending.interaction.request.options).toContainEqual(expect.objectContaining({ sourceCard: 'A091_ShiftingCultivator', disabled: true }))
    const rejected = session.resolveChoice(0, 'A091_ShiftingCultivator')
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(rejected.state.players[0]!.fields).toEqual([])
  })

  it('rejects another player responding to the issued reaction menu', () => {
    const session = orderedSetup()
    const pending = beforeChoices(session)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'select-trigger') throw new Error('Expected collect menu')
    const choice = pending.interaction.request.options.find(option => !('disabled' in option && option.disabled === true) && option.value !== '__pass__')!
    const rejected = session.resolveChoice(1, choice.value)
    expect(rejected.ok).toBe(false)
    expect(rejected.state).toEqual(pending.state)
    expect(rejected.interaction).toEqual(pending.interaction)
    const response = settle(session, session.resolveChoice(0, choice.value))
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(grainEvents(response)).toHaveLength(1)
  })

  it('does not qualify after cooking the last animal before using the market', () => {
    const session = orderedSetup()
    const cooked = cookSheep(session)
    expect(cooked.state.players[0]!.resources.grain).toBe(0)
    const response = settle(session, session.takeAction(0, 'sheep-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 0 })
    expect(grainEvents(response)).toEqual([])
  })

  it('restores pending reactions, undoes the award and retries without duplicate grain', () => {
    const session = orderedSetup()
    beforeChoices(session)
    const snapshot = JSON.parse(JSON.stringify(serializeSessionSnapshot(session.state, session)))
    const restored = new GameSession(rehydrateState(snapshot))
    sessions.push(restored)
    const pending = restored.getState()
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'select-trigger' } })
    expect(pending.state.players[0]!.resources.grain).toBe(1)
    const undone = restored.undoAction()
    expect(undone.ok).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 1, grain: 0 })
    expect(grainEvents(undone)).toEqual([])
    const response = settle(restored, restored.takeAction(0, 'sheep-market'))
    expect(response.state.players[0]!.resources).toMatchObject({ sheep: 2, grain: 1 })
    expect(grainEvents(response)).toHaveLength(1)
  })
})
