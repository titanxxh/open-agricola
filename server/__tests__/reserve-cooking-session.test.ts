import { afterEach, describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import type { GameState } from '../../shared/contract/types'
import { playMinor } from './_helpers/batch07-card-play'
import { createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (housed = false, configure?: (state: GameState) => void) => {
  const session = createWorkSession({
    configure: state => {
      state.round = 5
      const player = state.players[0]!
      player.improvements = ['Major_Fireplace1']
      Object.assign(player.resources, { sheep: housed ? 1 : 0, food: 0 })
      if (housed) player.houseAnimals = { '2-0': 'sheep' }
      state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 2
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const reorganization = (response: SessionResponse) => {
  expect(response.ok, response.error).toBe(true)
  const interaction = response.interaction
  if (interaction.stateId !== 'wait' || interaction.request.kind !== 'animal-reorg') {
    throw new Error('expected animal reorganization')
  }
  expect(interaction.playerIndex).toBe(0)
  return { request: interaction.request, requestKey: interaction.requestKey }
}

const fireplaceRecipe = (request: ReturnType<typeof reorganization>['request'], animal: 'sheep' | 'boar') => {
  const recipe = request.reserveCooking?.catalog.find(entry =>
    entry.sourceId === 'Major_Fireplace1' && entry.from[animal] === 1)
  if (!recipe) throw new Error(`missing Fireplace recipe for ${animal}`)
  return { sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 1 }
}

const restore = (session: GameSession) => {
  const saved = JSON.stringify({ state: session.getState().state, sessionCursor: session.createSessionPrivateCursor() })
  const result = new GameSession(JSON.parse(saved))
  sessions.push(result)
  return result
}

describe('cooking reserve animals during reorganization', () => {
  it('cooks one of two acquired sheep before housing the other', () => {
    const session = setup()
    const { request, requestKey } = reorganization(session.takeAction(0, 'sheep-market'))
    expect(request).toMatchObject({
      reserveCooking: {
        available: { sheep: 2 },
        catalog: [expect.objectContaining({
          sourceId: 'Major_Fireplace1', from: { sheep: 1 }, to: { food: 2 }, max: 2,
        })],
      },
    })

    const cooked = session.resolveChoice(0, 'cook-reserve', {
      zones: request.zones,
      requestKey,
      exchanges: [fireplaceRecipe(request, 'sheep')],
    })
    expect(reorganization(cooked).requestKey).toBe(requestKey)
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 2 })
    const placed = session.resolveChoice(0, 'confirm', { zones: request.zones })
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.houseAnimals).toEqual({ '2-0': 'sheep' })
    expect(placed.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([
      expect.objectContaining({ paid: { sheep: 1 }, gained: { food: 2 }, times: 1 }),
    ])
    expect(placed.state.log.some(entry => entry.key === 'log.reorganizeDiscard')).toBe(false)
  })

  it('preserves placed sheep, limits the batch to the current draft, and supports recovery and undo', () => {
    const session = setup(true)
    session.takeAction(0, 'sheep-market')
    const restored = restore(session)
    const pending = restored.getState()
    const { request, requestKey } = reorganization(pending)
    expect(request.reserveCooking?.available).toEqual({ sheep: 2 })
    const exchange = fireplaceRecipe(request, 'sheep')
    const submit = { zones: request.zones, requestKey, exchanges: [exchange] }
    expect(restored.resolveChoice(0, 'cook-reserve', { ...submit, requestKey: 'old' }).ok).toBe(false)
    expect(restored.resolveChoice(1, 'cook-reserve', submit).ok).toBe(false)
    const rejected = restored.resolveChoice(0, 'cook-reserve', { ...submit, exchanges: [exchange, { ...exchange, count: 2 }] })
    expect(rejected.ok).toBe(false)
    expect(rejected.interaction).toEqual(pending.interaction)
    expect(rejected.state.players[0]!.resources).toMatchObject({ sheep: 3, food: 0 })
    expect(rejected.state.events.filter(event => event.type === 'resource.exchanged')).toEqual([])

    const cooked = restored.resolveChoice(0, 'cook-reserve', submit)
    expect(reorganization(cooked).requestKey).toBe(requestKey)
    expect(cooked.state.players[0]!.houseAnimals).toEqual({ '2-0': 'sheep' })
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 2 })
    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(pending.interaction)
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 3, food: 0 })
    expect(undone.state.players[0]!.houseAnimals).toEqual({ '2-0': 'sheep' })
  })

  it('offers cooking for a boar exchanged from a placed sheep even when the herd size stays the same', () => {
    const session = setup(true, state => {
      state.players[0]!.occupationPlayed = ['B104_SheepWalker']
    })
    const opened = session.takeAnytimeAction(0, 'exchange')
    expect(opened.ok, opened.error).toBe(true)
    if (opened.interaction.stateId !== 'wait' || opened.interaction.request.kind !== 'choice') throw new Error('expected exchange')
    const option = opened.interaction.request.options.find(candidate => candidate.sourceCard === 'B104_SheepWalker'
      && candidate.effectPreview?.kind === 'resourceExchange' && candidate.effectPreview.resourcesGained.boar === 1)
    if (!option) throw new Error('expected Sheep Walker exchange for a boar')
    const exchanged = session.resolveChoice(0, `bulk:${option.value.split(':')[1]}=1`)
    const { request, requestKey } = reorganization(exchanged)
    expect(exchanged.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1 })
    expect(request.reserveCooking?.available).toEqual({ boar: 1 })
    expect(request.reserveCooking?.catalog.some(candidate => candidate.sourceId === 'B104_SheepWalker')).toBe(false)
    const keptNone = request.zones.map(zone => ({ ...zone, animalType: null, animalCount: 0 }))
    const cooked = session.resolveChoice(0, 'cook-reserve', {
      zones: keptNone, requestKey, exchanges: [fireplaceRecipe(request, 'boar')],
    })
    expect(reorganization(cooked).requestKey).toBe(requestKey)
    expect(cooked.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2 })
  })

  it('offers cooking for the boar granted by playing Mud Patch', () => {
    const cardId = 'A011_MudPatch'
    const session = setup(true, state => {
      state.players[0]!.minorHand = [cardId]
    })
    const granted = playMinor(session, cardId)
    const { request, requestKey } = reorganization(granted)
    expect(granted.state.players[0]!.minorPlayed).toContain(cardId)
    expect(request.reserveCooking?.available).toEqual({ boar: 1 })
    const cooked = session.resolveChoice(0, 'cook-reserve', {
      requestKey, zones: request.zones, exchanges: [fireplaceRecipe(request, 'boar')],
    })
    expect(reorganization(cooked).requestKey).toBe(requestKey)
    expect(cooked.state.players[0]!.resources).toMatchObject({ sheep: 1, boar: 0, food: 2 })
    expect(cooked.state.players[0]!.houseAnimals).toEqual({ '2-0': 'sheep' })
    expect(session.resolveChoice(0, 'confirm', { zones: request.zones }).ok).toBe(true)
  })

  it('offers only ordinary cooking when Herbal Garden forces reorganization without an animal gain', () => {
    const cardId = 'E036_HerbalGarden'
    const session = setup(true, state => {
      const player = state.players[0]!
      player.minorHand = [cardId]
      Object.assign(player.resources, { wood: 1, sheep: 3 })
      player.pastures = [{ id: 'occupied', tiles: [{ row: 0, col: 1 }], animalType: 'sheep', animalCount: 1 }]
    })
    const displaced = playMinor(session, cardId)
    const { request } = reorganization(displaced)
    expect(displaced.state.players[0]!.minorPlayed).toContain(cardId)
    expect(displaced.state.players[0]!.resources.sheep).toBe(3)
    expect(displaced.interaction.anytimeActions.some(action => action.id === 'exchange')).toBe(true)
    expect(request.reserveCooking).toBeUndefined()
    const zones = request.zones.map(zone => zone.zoneType === 'pasture'
      ? { ...zone, animalType: null, animalCount: 0 }
      : zone)
    const placed = session.resolveChoice(0, 'confirm', { zones })
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 0 })
    expect(placed.state.players[0]!.pastures[0]!.animalCount).toBe(0)
  })

  it('allows resuming the Master Tanner response before returning to the same reorganization', () => {
    const session = setup(false, state => {
      state.round = 10
      state.players[0]!.occupationPlayed = ['E085_MasterTanner']
      state.actionSpaces.find(space => space.id === 'pig-market')!.resources.boar = 2
    })
    const { request, requestKey } = reorganization(session.takeAction(0, 'pig-market'))
    const cooked = session.resolveChoice(0, 'cook-reserve', {
      zones: request.zones, requestKey, exchanges: [fireplaceRecipe(request, 'boar')],
    })
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'choice' } })
    const resumed = restore(session)
    const finished = resumed.resolveChoice(0, '__skip__')
    expect(reorganization(finished).requestKey).toBe(requestKey)
    expect(finished.state.players[0]!.resources).toMatchObject({ boar: 1, food: 2 })
    expect(finished.state.events.filter(event => event.type === 'resource.exchanged')).toHaveLength(1)
  })

  it('allows the legacy placement flow when reorganization has no acquisition origin', () => {
    const session = setup(false, state => {
      const player = state.players[0]!
      player.occupationPlayed = ['C086_LivestockFeeder']
      Object.assign(player.resources, { sheep: 2, grain: 2 })
      player.cardStates.C086_LivestockFeeder = { extraData: { animalCounts: { sheep: 2 } } }
    })
    const { request } = reorganization(session.devSetResources(0, { grain: 0, sheep: 3 }))
    expect(request.reserveCooking).toBeUndefined()
    const resumed = restore(session)
    const pending = reorganization(resumed.getState())
    expect(pending.request.reserveCooking).toBeUndefined()
    expect(resumed.resolveChoice(0, 'confirm', { zones: pending.request.zones }).ok).toBe(true)
  })

  it('validates distinct Horse Butchery recipes against one shared reserve limit', () => {
    const session = createWorkSession({
      options: { enableFarmersOfTheMoor: true, allowIncompleteFarmersOfTheMoorMinorDeal: true },
      configure: state => {
        state.round = 5
        const player = state.players[0]!
        player.minorPlayed = ['M106_HorseButchery']
        Object.assign(player.resources, { horse: 3, sheep: 0, food: 0 })
        state.actionSpaces.find(space => space.id === 'sheep-market')!.resources.sheep = 1
      },
    })
    sessions.push(session)
    const { request, requestKey } = reorganization(session.takeAction(0, 'sheep-market'))
    const recipes = request.reserveCooking?.catalog.filter(entry => (entry.from.horse ?? 0) > 0)
    expect(recipes?.map(recipe => recipe.from.horse)).toEqual([1, 2])
    const exchanges = (recipes ?? []).map(({ sourceId, exchangeIndex }) => ({ sourceId, exchangeIndex, count: 1 }))
    const keepingHorse = [{ id: 'house:2-0', zoneType: 'house', animalType: 'horse', animalCount: 1 }]
    const overBudget = session.resolveChoice(0, 'cook-reserve', { requestKey, exchanges, zones: keepingHorse })
    expect(overBudget.ok).toBe(false)
    expect(overBudget.state.players[0]!.resources).toMatchObject({ horse: 3, food: 0 })
    const keepingSheep = [{ id: 'house:2-0', zoneType: 'house', animalType: 'sheep', animalCount: 1 }]
    const cooked = session.resolveChoice(0, 'cook-reserve', { requestKey, exchanges, zones: keepingSheep })
    expect(reorganization(cooked).requestKey).toBe(requestKey)
    expect(cooked.state.players[0]!.resources).toMatchObject({ horse: 0, sheep: 1, food: 7 })
  })
})
