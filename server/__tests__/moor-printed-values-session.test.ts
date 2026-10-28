import assert from 'node:assert/strict'
import { afterEach, describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { emptyResources } from '../../shared/contract/state-constants'
import { setWorkersAtHome } from '../../shared/domain/player'
import { addPublicCardMarker } from '../../shared/cards/helpers/public-card-markers'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, getChoiceOptions } from './_helpers/session-assertions'

const STOREHOUSE = 'M090_WinterStorehouse'
const MACHINE = 'M060_SowingMachine'
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

const setup = (cardId: string, configure?: (state: GameState) => void) => {
  const session = createWorkSession({ seed: 428029,
    options: { playerCount: 2, enableFarmersOfTheMoor: true },
    configure: state => {
      state.round = 5
      state.currentPlayerIndex = 0
      for (const space of state.actionSpaces) space.takenBy = []
      for (const player of state.players) {
        player.resources = { ...emptyResources, food: 20, fuel: 3 }
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.minorPlayed = []
        player.occupationPlayed = []
        player.improvements = []
        player.cardStates = {}
        player.houseAnimals = {}
        setWorkersAtHome(state, player, 2)
      }
      const owner = state.players[0]!
      owner.minorHand = [cardId]
      if (cardId === STOREHOUSE) {
        owner.resources.wood = 1
        owner.resources.clay = 2
      } else {
        owner.resources.wood = 3
        owner.resources.horse = 1
        const room = owner.roomTiles[0]!
        owner.houseAnimals = { [`${room.row}-${room.col}`]: 'horse' }
      }
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

const cards = (response: SessionResponse) => {
  const category = response.scores[0]!.categories.find(category => category.key === 'cards')
  assert.ok(category)
  return category
}

const openMinorChoice = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  const branch = getChoiceOptions(response).find(option => option.value.startsWith('action-improvement-'))
  if (branch) response = session.resolveChoice(0, branch.value)
  expect(response.ok, response.error).toBe(true)
  return response
}

const buy = (session: GameSession, cardId: string) => {
  let response = openMinorChoice(session)
  if (response.state.players[0]!.minorHand.includes(cardId)) {
    expect(getChoiceOptions(response), JSON.stringify(response.interaction))
      .toContainEqual(expect.objectContaining({ value: cardId }))
    response = session.resolveChoice(0, cardId)
    expect(response.ok, response.error).toBe(true)
  }
  if (response.interaction.promptKey === 'prompt.selectPayment') {
    const payment = getChoiceOptions(response).find(option => !option.disabled && option.value !== 'cancel')
    assert.ok(payment)
    response = session.resolveChoice(0, payment.value)
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
  expect(response.state.players[0]!.minorPlayed).toContain(cardId)
  expect(response.state.players[0]!.minorHand).toEqual([])
  return response
}

const restore = (session: GameSession) => {
  const snapshot = session.withCtx(() => serializeSessionSnapshot(session.state, session))
  const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(snapshot))))
  sessions.push(restored)
  const actual = restored.getState(), expected = session.getState()
  expect(actual.interaction).toEqual(expected.interaction)
  expect(actual.scores).toEqual(expected.scores)
  expect(captureStateWithHistory(actual.state)).toEqual(captureStateWithHistory(expected.state))
  return restored
}

describe('Moor printed values chosen by the maintainer', () => {
  it('pays for Winter Storehouse but awards zero printed points through purchase, recovery and undo/rebuy', () => {
    let session = setup(STOREHOUSE)
    const initial = session.getState()
    expect(cards(initial)).toMatchObject({ total: 0, entries: [] })
    let response = buy(session, STOREHOUSE)
    expect(cards(response)).toMatchObject({ total: 0, entries: [
      { type: 'card', cardId: STOREHOUSE, cardType: 'minor', score: 0 },
    ] })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, clay: 0, food: 20, fuel: 3 })
    expect(response.state.players[0]!.cardStates[STOREHOUSE]?.counters?.usage).toBe(3)
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'card.played',
      cardId: STOREHOUSE, cardType: 'minor', payment: expect.objectContaining({ resources: { wood: 1, clay: 2 } }) }))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid',
      actorPlayerId: 'p1', sourceCardId: STOREHOUSE, resources: { wood: 1, clay: 2 }, paymentFor: 'minor-improvement' }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.playMinorImprovement',
      params: expect.objectContaining({ improvements: STOREHOUSE, costResources: { wood: 1, clay: 2 } }) }))
    expect(session.getState()).toEqual(response)
    expect(session.getState()).toEqual(response)
    session = restore(session)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 20, fuel: 3, wood: 1, clay: 2 })
    expect(response.state.players[0]!.minorHand).toEqual([STOREHOUSE])
    expect(response.state.players[0]!.minorPlayed).toEqual([])
    expect(response.state.players[0]!.cardStates[STOREHOUSE]).toBeUndefined()
    expect(cards(response)).toMatchObject({ total: 0, entries: [] })
    response = buy(session, STOREHOUSE)
    expect(cards(response)).toMatchObject({ total: 0, entries: [
      { type: 'card', cardId: STOREHOUSE, cardType: 'minor', score: 0 },
    ] })
    expect(response.state.players[0]!.cardStates[STOREHOUSE]?.counters?.usage).toBe(3)
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === STOREHOUSE)).toHaveLength(1)
    expect(cards(restore(session).getState())).toEqual(cards(response))
  })

  it('pays for Sowing Machine with one housed horse and awards one printed point through recovery and undo/rebuy', () => {
    let session = setup(MACHINE)
    expect(cards(session.getState())).toMatchObject({ total: 0, entries: [] })
    let response = buy(session, MACHINE)
    expect(cards(response)).toMatchObject({ total: 1, entries: [
      { type: 'card', cardId: MACHINE, cardType: 'minor', score: 1 },
    ] })
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, horse: 1, food: 20, fuel: 3 })
    expect(Object.values(response.state.players[0]!.houseAnimals)).toEqual(['horse'])
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'card.played',
      cardId: MACHINE, cardType: 'minor', payment: expect.objectContaining({ resources: { wood: 3 } }) }))
    expect(response.state.events).toContainEqual(expect.objectContaining({ type: 'resource.paid',
      actorPlayerId: 'p1', sourceCardId: MACHINE, resources: { wood: 3 }, paymentFor: 'minor-improvement' }))
    expect(response.state.log).toContainEqual(expect.objectContaining({ key: 'log.playMinorImprovement',
      params: expect.objectContaining({ improvements: MACHINE, costResources: { wood: 3 } }) }))
    expect(session.getState()).toEqual(response)
    expect(session.getState()).toEqual(response)
    session = restore(session)
    response = session.undoAction()
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toEqual({ ...emptyResources, food: 20, fuel: 3, wood: 3, horse: 1 })
    expect(response.state.players[0]!.minorHand).toEqual([MACHINE])
    expect(response.state.players[0]!.minorPlayed).toEqual([])
    expect(cards(response)).toMatchObject({ total: 0, entries: [] })
    response = buy(session, MACHINE)
    expect(cards(response)).toMatchObject({ total: 1, entries: [
      { type: 'card', cardId: MACHINE, cardType: 'minor', score: 1 },
    ] })
    expect(response.state.events.filter(event => event.type === 'card.played' && event.cardId === MACHINE)).toHaveLength(1)
    expect(cards(restore(session).getState())).toEqual(cards(response))
  })

  it.each([
    { cardId: STOREHOUSE, score: 0, total: 4 },
    { cardId: MACHINE, score: 1, total: 5 },
  ])('preserves another card and an independent token when buying $cardId', ({ cardId, score, total }) => {
    const session = setup(cardId, state => {
      const owner = state.players[0]!
      owner.improvements = ['Major_Well']
      addPublicCardMarker(owner, 'M027_GardenPath', {
        id: 'garden-path', label: 'Garden Path', score: -1,
        sourceCardId: 'M027_GardenPath', sourcePlayerId: state.players[1]!.id,
      })
    })
    expect(cards(session.getState())).toMatchObject({ total: 4, entries: [
      { type: 'card', cardId: 'Major_Well', cardType: 'major', score: 4 },
    ] })
    const response = buy(session, cardId)
    expect(cards(response)).toMatchObject({ total, entries: [
      { type: 'card', cardId: 'Major_Well', cardType: 'major', score: 4 },
      { type: 'card', cardId, cardType: 'minor', score },
    ] })
    const marker = response.scores[0]!.categories.flatMap(category => category.entries)
      .filter(entry => entry.type === 'marker')
    expect(marker).toEqual([expect.objectContaining({ markerId: 'garden-path', score: -1,
      cardId: 'M027_GardenPath', holderPlayerId: 'p1', sourcePlayerId: 'p2' })])
    expect(restore(session).getState().scores).toEqual(response.scores)
  })

  it.each([
    { cardId: STOREHOUSE, wood: 0, clay: 2, horse: 0 },
    { cardId: STOREHOUSE, wood: 1, clay: 1, horse: 0 },
    { cardId: MACHINE, wood: 2, clay: 0, horse: 1 },
    { cardId: MACHINE, wood: 3, clay: 0, horse: 0 },
  ])('rejects an unaffordable or unmet-prerequisite purchase without changing state: %j', ({ cardId, wood, clay, horse }) => {
    let session = setup(cardId, state => {
      const owner = state.players[0]!
      Object.assign(owner.resources, { wood, clay, horse })
      if (!horse) owner.houseAnimals = {}
      owner.minorHand.push('A016_RammedClay', 'M100_Pheromones')
    })
    const offered = openMinorChoice(session)
    expect(getChoiceOptions(offered).some(option => option.value === cardId && !option.disabled)).toBe(false)
    expect(getChoiceOptions(offered), JSON.stringify(offered.interaction))
      .toContainEqual(expect.objectContaining({ value: 'M100_Pheromones' }))
    session = restore(session)
    const before = JSON.stringify(session.withCtx(() => serializeSessionSnapshot(session.state, session)))
    for (let attempt = 0; attempt < 2; attempt++) {
      assertRejectedUnchanged(session, () => session.resolveChoice(0, cardId))
      expect(JSON.stringify(session.withCtx(() => serializeSessionSnapshot(session.state, session)))).toBe(before)
    }
    const response = session.resolveChoice(0, 'M100_Pheromones')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.minorHand).toContain(cardId)
    expect(response.state.players[0]!.minorPlayed).toEqual(['M100_Pheromones'])
    expect(cards(response).total).toBe(0)
  })
})
