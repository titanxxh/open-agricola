import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import { createPlayerActionSpaces } from '../../shared/cards/player-action-space'

const CATCHER = 'C168_AnimalCatcher'
const COMB = 'E059_CombandCutter'
const ARCHWAY = 'D051_Archway'
const sessions: GameSession[] = []

afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

// Confirmed #1125 seam: real Session before rewards, replacement, payment and
// animal housing. Four players follow Animal Catcher's printed 4+ requirement.
const setup = ({ sheep = 3, food = 8, catcher = true, comb = true, moor = false, archway = false, actor = 0 } = {}) => {
  const session = createWorkSession({
    seed: 42,
    options: { playerCount: 4, enableFarmersOfTheMoor: moor },
    configure(state) {
      state.round = 1
      state.currentPlayerIndex = actor
      for (const player of state.players) {
        setWorkersAtHome(state, player, 2)
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.houseAnimalType = null
        player.houseAnimalCount = 0
        player.stableAnimals = {}
        Object.assign(player.resources, {
          food: 20, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0,
          sheep: 0, boar: 0, cattle: 0, ...(moor ? { horse: 0 } : {}),
        })
      }
      const owner = state.players[0]!
      owner.occupationPlayed = catcher ? [CATCHER] : []
      owner.minorPlayed = [...(comb ? [COMB] : []), ...(archway ? [ARCHWAY] : [])]
      owner.resources.food = food
      owner.fields = []
      owner.pastures = []
      owner.stableTiles = [{ row: 0, col: 1 }, { row: 0, col: 2 }]
      if (moor) owner.farmTerrain = []
      const market = state.actionSpaces.find((space) => space.id === 'sheep-market')
      if (!market) throw new Error('Missing Sheep Market')
      market.resources.sheep = sheep
      if (archway) {
        state.actionSpaces.push(...createPlayerActionSpaces(state))
        const space = state.actionSpaces.find((entry) => entry.id === ARCHWAY)
        const worker = owner.workers.find((entry) => entry.isActive)
        if (!space || !worker) throw new Error('Missing Archway space or worker')
        space.takenBy = [{ playerId: owner.id, workerId: worker.id }]
        state.players.forEach((player) => markAllWorkersUsed(state, player))
      }
    },
  })
  sessions.push(session)
  return session
}

const chooseReplacement = (session: GameSession, offered: SessionResponse, accept: boolean) => {
  expect(offered.ok, offered.error).toBe(true)
  expect(offered.interaction).toMatchObject({
    stateId: 'wait', playerIndex: 0, promptKey: 'ui.interactionSelectReplacement',
  })
  if (offered.interaction.stateId !== 'wait') throw new Error('Expected replacement choice')
  if (offered.interaction.request.kind !== 'choice') throw new Error('Expected replacement options')
  const options = offered.interaction.request.options
  expect(options.filter((option) => option.sourceCard === CATCHER)).toHaveLength(1)
  const option = options.find((candidate) => accept
    ? candidate.sourceCard === CATCHER
    : candidate.labelKey === 'ui.interactionDoNotReplace')
  if (!option) throw new Error('Missing replacement decision')
  return session.resolveChoice(0, option.value)
}

const houseAnimals = (session: GameSession, response: SessionResponse, lastAnimal: 'cattle' | 'horse' = 'cattle') => {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0 })
  if (response.interaction.stateId !== 'wait') throw new Error('Expected animal housing')
  expect(response.interaction.request.kind).toBe('animal-reorg')
  return session.resolveChoice(0, 'confirm', {
    zones: [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      { id: 'stable:0-1', zoneType: 'stable', animalType: 'boar', animalCount: 1 },
      { id: 'stable:0-2', zoneType: 'stable', animalType: lastAnimal, animalCount: 1 },
    ],
  })
}

describe('C168 replaces only Day Laborer base gain', () => {
  it.each([
    { sheep: 3, offeredFood: 11, finalFood: 5 },
    { sheep: 2, offeredFood: 10, finalFood: 4 },
  ])('keeps the $sheep-food explicit reward and replaces the base two food once', ({ sheep, offeredFood, finalFood }) => {
    const session = setup({ sheep })
    const offered = session.takeAction(0, 'day-laborer')

    expect(offered.state.players[0]!.resources.food).toBe(offeredFood)
    const selected = chooseReplacement(session, offered, true)
    expect(selected.state.players[0]!.resources).toMatchObject({
      food: finalFood, sheep: 1, boar: 1, cattle: 1,
    })
    const result = houseAnimals(session, selected)
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({
      food: finalFood, sheep: 1, boar: 1, cattle: 1,
    })
    expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(result.state.events.filter((event) =>
      event.type === 'resource.paid' && event.sourceCardId === CATCHER && event.resources.food === 6,
    )).toHaveLength(1)
    expect(result.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === COMB && event.resources.food === sheep,
    )).toHaveLength(1)
    const score = result.scores?.[0]
    if (!score) throw new Error('Expected owner score')
    expect(score.categories.filter((category) =>
      ['sheeps', 'boars', 'cattles'].includes(category.key),
    ).map(({ key, quantity, total }) => ({ key, quantity, total }))).toEqual([
      { key: 'sheeps', quantity: 1, total: 1 },
      { key: 'boars', quantity: 1, total: 1 },
      { key: 'cattles', quantity: 1, total: 1 },
    ])
  })

  it('declines only the base replacement and keeps both normal food rewards', () => {
    const session = setup()
    const result = chooseReplacement(session, session.takeAction(0, 'day-laborer'), false)

    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ food: 13, sheep: 0, boar: 0, cattle: 0 })
    expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(result.state.events.some((event) =>
      event.type === 'resource.paid' && event.sourceCardId === CATCHER,
    )).toBe(false)
  })

  it('does not replace rewards without Animal Catcher', () => {
    const result = setup({ catcher: false }).takeAction(0, 'day-laborer')

    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ food: 13, sheep: 0, boar: 0, cattle: 0 })
    expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('does not replace a different action-space gain', () => {
    const result = setup().takeAction(0, 'grain-seeds')

    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ grain: 1, food: 8, sheep: 0, boar: 0, cattle: 0 })
    expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('does not replace an opponent Day Laborer gain', () => {
    const result = setup({ actor: 1 }).takeAction(1, 'day-laborer')

    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources.food).toBe(8)
    expect(result.state.players[1]!.resources).toMatchObject({ food: 22, sheep: 0, boar: 0, cattle: 0 })
    expect(result.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  })

  it('preserves the committed animal gain and blocked payment when food is insufficient, and can undo then decline', () => {
    const session = setup({ comb: false, food: 5 })
    const blocked = chooseReplacement(session, session.takeAction(0, 'day-laborer'), true)

    expect(blocked.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'engine-blocked' } })
    expect(blocked.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 1 })
    const undone = session.undoAction()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 0, boar: 0, cattle: 0 })
    expect(undone.state.actionSpaces.find((space) => space.id === 'day-laborer')?.takenBy).toEqual([])
    const retried = chooseReplacement(session, session.takeAction(0, 'day-laborer'), false)
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources).toMatchObject({ food: 7, sheep: 0, boar: 0, cattle: 0 })
  })

  it('restores both rewards on undo and can retry the base replacement without duplicate payment or animals', () => {
    const session = setup()
    const selected = chooseReplacement(session, session.takeAction(0, 'day-laborer'), true)
    houseAnimals(session, selected)
    const undone = session.undoAction()

    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 8, sheep: 0, boar: 0, cattle: 0 })
    const retried = houseAnimals(session,
      chooseReplacement(session, session.takeAction(0, 'day-laborer'), true))
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 1 })
    expect(retried.state.events.filter((event) =>
      event.type === 'resource.paid' && event.sourceCardId === CATCHER,
    )).toHaveLength(1)
  })

  it('can replace the genuine Day Laborer gain granted by Archway', () => {
    const session = setup({ archway: true, comb: false })
    let response = session.performRoundEnd()
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'select-trigger') {
      response = session.resolveChoice(0, ARCHWAY)
    }
    if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
      throw new Error('Expected Archway reuse choice')
    }
    const accept = response.interaction.request.options.find((option) => option.value !== '__skip__')
    if (!accept) throw new Error('Missing Archway reuse option')
    response = session.resolveChoice(0, accept.value)
    expect(response.interaction).toMatchObject({ stateId: 'wait', promptKey: 'ui.interactionMoveFarmerToSpace' })
    response = session.resolveChoice(0, 'day-laborer')

    expect(response.state.players[0]!.resources.food).toBe(8)
    const selected = chooseReplacement(session, response, true)
    expect(selected.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 1, boar: 1, cattle: 1 })
    const result = houseAnimals(session, selected)
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ food: 2, sheep: 1, boar: 1, cattle: 1 })
  })

  it('keeps Farmers of the Moor animal choices and the harvest cost', () => {
    const session = setup({ moor: true })
    const offered = session.takeAction(0, 'day-laborer')
    expect(offered.state.players[0]!.resources.food).toBe(11)
    const combos = chooseReplacement(session, offered, true)
    expect(combos.interaction.stateId).toBe('wait')
    if (combos.interaction.stateId !== 'wait' || combos.interaction.request.kind !== 'choice') {
      throw new Error('Expected Moor animal combinations')
    }
    expect(combos.interaction.request.options).toHaveLength(4)
    const horses = combos.interaction.request.options.find((option) =>
      option.effectPreview?.kind === 'resourceExchange' &&
      option.effectPreview.resourcesGained?.sheep === 1 &&
      option.effectPreview.resourcesGained.boar === 1 &&
      option.effectPreview.resourcesGained.horse === 1)
    if (!horses) throw new Error('Missing sheep, boar and horse combination')
    const selected = session.resolveChoice(0, horses.value)
    expect(selected.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 0, horse: 1 })
    const result = houseAnimals(session, selected, 'horse')
    expect(result.ok, result.error).toBe(true)
    expect(result.state.players[0]!.resources).toMatchObject({ food: 5, sheep: 1, boar: 1, cattle: 0, horse: 1 })
  })
})
