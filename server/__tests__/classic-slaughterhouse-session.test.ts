import { afterEach, describe, expect, it } from 'vitest'
import { CI097_Slaughterhouse } from '../../shared/cards/classic/CI/CI097_Slaughterhouse'
import type { CustomCardData } from '../../shared/cards/session-card-context'
import { requireActiveCardRegistry } from '../../shared/cards/active-registry'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { GameState } from '../../shared/contract/types'
import { rehydrateState, serializeSessionSnapshot } from '../../shared/session/serialization'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { createWorkSession } from './_helpers/session-fixtures'
import { confirmNextPlayer, confirmPlayerSwitch } from './_helpers/pending-confirms'
import { descriptionEffects } from './_helpers/choice-description'

const CARD_ID = CI097_Slaughterhouse.meta.id
const customCards: CustomCardData[] = [{ cardType: 'minor', cardJson: CI097_Slaughterhouse.meta }]
const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function settlePlayerSwitches(session: GameSession, initial: SessionResponse) {
  let response = initial
  while (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'confirm-player-switch') {
    expect(response.ok, response.error).toBe(true)
    response = confirmPlayerSwitch(session)
  }
  return response
}

function harvestSession(configure?: (state: GameState) => void, playerCount = 4) {
  const session = createWorkSession({
    options: { playerCount },
    customCards,
    configure(state) {
      state.round = 4
      state.players.forEach((player, index) => {
        player.startPlayer = index === 0
        player.resources.food = 0
        player.resources.grain = 1
        markAllWorkersUsed(state, player)
      })
      state.players[0]!.minorPlayed = [CARD_ID]
      configure?.(state)
    },
  })
  sessions.push(session)
  return session
}

/** Only dismiss transition confirmations and the optional post-reap window. */
function nextFeeding(session: GameSession, initial: SessionResponse): SessionResponse {
  let response = initial
  for (let step = 0; step < 30; step++) {
    expect(response.ok, response.error).toBe(true)
    const interaction = response.interaction
    if (interaction.stateId !== 'wait' || interaction.request.kind === 'feed') return response
    if (interaction.request.kind === 'confirm-player-switch') response = confirmPlayerSwitch(session)
    else if (interaction.request.kind === 'confirm-next-player') response = confirmNextPlayer(session)
    else if (session.peekEnginePendingEnvelope()?.syntheticKind === 'post-reap-anytime') {
      response = session.resolveChoice(interaction.playerIndex, '__skip__')
    } else throw new Error(`Unexpected harvest interaction: ${interaction.request.kind}`)
  }
  throw new Error('Harvest failed to reach its next feeding request')
}

function expectFeed(response: SessionResponse, playerIndex: number) {
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex, request: { kind: 'feed' } })
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'feed') {
    throw new Error('Expected feeding request')
  }
  return response.interaction.request
}

function finishFeeding(session: GameSession, initial: SessionResponse) {
  const order: number[] = []
  let response = nextFeeding(session, initial)
  while (response.interaction.stateId === 'wait') {
    const index = response.interaction.playerIndex
    expectFeed(response, index)
    order.push(index)
    expect(order.length).toBeLessThanOrEqual(session.state.players.length)
    response = nextFeeding(session, session.resolveChoice(index, 'confirm', { selections: [] }))
  }
  expect(response.state.round).toBe(5)
  expect(response.interaction.stateId).toBe('idle')
  return { response, order }
}

function moorHorseSession(cookingPlayer: 0 | 1) {
  const session = createWorkSession({
    seed: 42,
    options: { playerCount: 4, enableFarmersOfTheMoor: true },
    customCards,
    configure(state) {
      state.round = 4
      state.players.forEach((player, index) => {
        player.startPlayer = index === 0
        Object.assign(player.resources, { food: index < 2 ? 3 : 4, grain: 1, fuel: 2 })
        markAllWorkersUsed(state, player)
      })
      state.players[0]!.minorPlayed = [CARD_ID]
      const cook = state.players[cookingPlayer]!
      cook.improvements = ['Major_Moor_HorseSlaughterhouse1']
      Object.assign(cook.resources, { food: 2, horse: 1 })
      const room = cook.roomTiles[0]!
      cook.houseAnimals = { [`${room.row}-${room.col}`]: 'horse' }
    },
  })
  sessions.push(session)
  return session
}

function cookHorse(session: GameSession, response: SessionResponse, playerIndex: number) {
  const request = expectFeed(response, playerIndex)
  expect(request.remaining).toBe(2)
  const recipe = request.exchangeCatalog?.find(
    (entry) => entry.sourceId === 'Major_Moor_HorseSlaughterhouse1' && entry.from.horse === 1,
  )
  expect(recipe).toBeDefined()
  return session.resolveChoice(playerIndex, 'confirm', {
    selections: [{ sourceId: recipe!.sourceId, exchangeIndex: recipe!.exchangeIndex, count: 1 }],
  })
}

function confirmHeating(session: GameSession, response: SessionResponse, playerIndex: number) {
  expect(response.ok, response.error).toBe(true)
  expect(response.interaction).toMatchObject({
    stateId: 'wait', playerIndex, request: { kind: 'heating', required: 2 },
  })
  let next = session.resolveChoice(playerIndex, 'confirm', { fuelUsed: 2, selections: [] })
  for (let step = 0; step < 2 && next.interaction.stateId === 'wait' && next.interaction.playerIndex >= 2; step++) {
    const other = next.interaction.playerIndex
    expect(next.interaction.request).toMatchObject({ kind: 'heating', required: 2 })
    next = session.resolveChoice(other, 'confirm', { fuelUsed: 2, selections: [] })
  }
  return next
}

describe('classic I97 Slaughterhouse', () => {
  it.each([
    { resource: 'sheep', food: 5, cookIndex: 1, reward: 1 },
    { resource: 'grain', food: 4, cookIndex: 1, reward: 0 },
    { resource: 'vegetable', food: 7, cookIndex: 1, reward: 0 },
    { resource: 'sheep', food: 5, cookIndex: 0, reward: 0 },
  ] as const)('handles Culinary Artist converting $resource for player $cookIndex', ({
    resource, food, cookIndex, reward,
  }) => {
    const artist = 'A158_CulinaryArtist'
    const session = createWorkSession({
      options: { playerCount: 4 },
      customCards,
      configure(state) {
        state.currentPlayerIndex = 2
        state.players.forEach(player => {
          Object.assign(player.resources, { food: 0, grain: 0, vegetable: 0, sheep: 0 })
        })
        state.players[0]!.minorPlayed = [CARD_ID]
        const cook = state.players[cookIndex]!
        cook.occupationPlayed = [artist]
        cook.resources[resource] = 1
        if (resource === 'sheep') {
          const room = cook.roomTiles[0]!
          cook.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
        }
      },
    })
    sessions.push(session)
    let response = settlePlayerSwitches(session, session.takeAction(2, 'traveling-players'))
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: cookIndex, request: { kind: 'choice' } })
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Culinary Artist choice')
    const choice = response.interaction.request.options?.find(option => !option.disabled &&
      descriptionEffects(option.descriptionPreview).some(effect =>
        (effect.kind === 'payment' || effect.kind === 'resourceExchange') && effect.resourcesPaid?.[resource] === 1))
    expect(choice).toBeDefined()
    response = settlePlayerSwitches(session, session.resolveChoice(cookIndex, choice!.value))
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[cookIndex]!.resources).toMatchObject({ [resource]: 0, food })
    expect(response.state.players[0]!.resources.food).toBe(cookIndex === 0 ? food : reward)
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'confirm-next-player' } })
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'resource.exchanged', actorPlayerId: response.state.players[cookIndex]!.id,
      exchangeSource: artist, paid: { [resource]: 1 }, gained: { food },
    }))
    expect(JSON.stringify(response.state.log)).toContain(artist)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
  })

  it.each([
    { cookIndex: 1, accept: true, reward: 1 },
    { cookIndex: 0, accept: true, reward: 0 },
    { cookIndex: 1, accept: false, reward: 0 },
  ])('handles Nutrition Expert for player $cookIndex, accepted: $accept', ({ cookIndex, accept, reward }) => {
    const nutrition = 'B135_NutritionExpert'
    const session = createWorkSession({
      options: { playerCount: 4 },
      customCards,
      configure(state) {
        state.round = 3
        state.players.forEach(player => {
          Object.assign(player.resources, { food: 0, grain: 0, vegetable: 0, sheep: 0 })
          markAllWorkersUsed(state, player)
        })
        state.players[0]!.minorPlayed = [CARD_ID]
        const cook = state.players[cookIndex]!
        cook.occupationPlayed = [nutrition]
        Object.assign(cook.resources, { grain: 1, vegetable: 1, sheep: 1 })
        const room = cook.roomTiles[0]!
        cook.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
      },
    })
    sessions.push(session)
    let response = settlePlayerSwitches(session, session.performRoundEnd())
    expect(response.ok, response.error).toBe(true)
    expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: cookIndex, request: { kind: 'choice' } })
    if (response.interaction.stateId !== 'wait') throw new Error('Expected Nutrition Expert choice')
    const choice = response.interaction.request.options?.find(option => !option.disabled &&
      (accept ? option.value !== '__skip__' : option.value === '__skip__'))
    expect(choice).toBeDefined()
    response = settlePlayerSwitches(session, session.resolveChoice(cookIndex, choice!.value))
    expect(response.ok, response.error).toBe(true)
    const cook = response.state.players[cookIndex]!
    expect(cook.resources).toMatchObject({ food: accept ? 5 : 0, grain: accept ? 0 : 1, vegetable: accept ? 0 : 1, sheep: accept ? 0 : 1 })
    expect(cook.cardStates[nutrition]?.counters?.bonusVp ?? 0).toBe(accept ? 2 : 0)
    expect(response.state.players[0]!.resources.food).toBe(cookIndex === 0 && accept ? 5 : reward)
    expect(response.state.round).toBe(4)
    expect(response.interaction.stateId).toBe('idle')
    expect(response.state.events.filter(event => event.type === 'resource.exchanged' && event.exchangeSource === nutrition))
      .toHaveLength(accept ? 1 : 0)
    if (accept) expect(JSON.stringify(response.state.log)).toContain(nutrition)
    expect(response.scores?.[0]?.categories.find(category => category.key === 'cards')?.entries)
      .toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
  })

  it.each([
    { played: false, expected: [2, 3, 0, 1] },
    { played: true, expected: [2, 3, 1, 0] },
  ])('feeds in start-player order with owner last only when played: $played', ({ played, expected }) => {
    // Four seats distinguish rotation from simply reversing the two-player order.
    const session = harvestSession((state) => {
      state.players.forEach((player, index) => {
        player.startPlayer = index === 2
      })
      if (!played) state.players[0]!.minorPlayed = []
    }, 4)
    const { response, order } = finishFeeding(session, session.performRoundEnd())
    expect(order).toEqual(expected)
    expect(response.state.players.map((player) => player.resources.begging)).toEqual([4, 4, 4, 4])
    expect(
      response.state.log
        .filter((entry) => entry.key === 'log.harvestFeedDetail')
        .map((entry) => entry.params?.player)
        .toReversed(),
    ).toEqual(expected.map((index) => session.state.players[index]!.name))
  })

  it('keeps normal start-player order among equal late-feeding priorities', () => {
    const otherCard = 'TEST_OtherLateFeeder'
    const session = harvestSession((state) => {
      state.players.forEach((player, index) => {
        player.startPlayer = index === 2
      })
      state.players[2]!.occupationPlayed = [otherCard]
    }, 4)
    session.withCtx(() => {
      requireActiveCardRegistry('late-feeder test').loadImpl(otherCard, {
        effect: { id: otherCard, computeHarvestFeedingOrderPriority: () => 1 },
      })
    })
    const { order } = finishFeeding(session, session.performRoundEnd())
    expect(order).toEqual([3, 1, 2, 0])
  })

  it('preserves the pending reordered feeding queue through save and restore', () => {
    const session = harvestSession((state) => {
      state.players.forEach((player, index) => {
        player.startPlayer = index === 2
      })
    }, 4)
    const pending = nextFeeding(session, session.performRoundEnd())
    expectFeed(pending, 2)
    const saved = session.withCtx(() => serializeSessionSnapshot(session.state, session))
    const restored = new GameSession(rehydrateState(JSON.parse(JSON.stringify(saved))), customCards)
    sessions.push(restored)
    expect(restored.getState().interaction).toEqual(pending.interaction)
    expect(finishFeeding(restored, restored.getState()).order).toEqual([2, 3, 1, 0])
  })

  it('awards one food for an opponent cooking two sheep before the owner feeds', () => {
    const session = harvestSession((state) => {
      state.players[0]!.resources.food = 3
      const opponent = state.players[1]!
      opponent.improvements = ['Major_Fireplace1']
      opponent.resources.sheep = 2
      opponent.pastures = [{
        id: 'sheep',
        tiles: [{ row: 0, col: 1 }],
        animalType: 'sheep',
        animalCount: 2,
      }]
    })
    const first = nextFeeding(session, session.performRoundEnd())
    const request = expectFeed(first, 1)
    const recipe = request.exchangeCatalog?.find(
      (entry) => entry.sourceId === 'Major_Fireplace1' && entry.from.sheep === 1,
    )
    expect(recipe).toBeDefined()
    const cooked = nextFeeding(session, session.resolveChoice(1, 'confirm', {
      selections: [{
        sourceId: recipe!.sourceId,
        exchangeIndex: recipe!.exchangeIndex,
        count: 2,
      }],
    }))
    // The owner can spend the newly awarded food in this same harvest.
    const finished = finishFeeding(session, cooked).response
    expect(
      finished.scores?.[0]?.categories.find((category) => category.key === 'cards')?.entries,
    ).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
    expect(finished.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
    expect(finished.state.players[1]!.resources).toMatchObject({ food: 0, sheep: 0, begging: 0 })
    expect(finished.state.events).toContainEqual(
      expect.objectContaining({
        type: 'harvest.feedConverted',
        playerId: session.state.players[1]!.id,
        cost: { sheep: 2 },
        food: { food: 4 },
      }),
    )
    expect(finished.state.log).toContainEqual(
      expect.objectContaining({
        key: 'log.harvestFeedDetail',
        params: expect.objectContaining({
          player: session.state.players[0]!.name,
          resources: expect.objectContaining({ food: 4 }),
        }),
      }),
    )
  })

  it('receives food from an opponent cooking a horse before its last feeding in Farmers of the Moor', () => {
    const session = moorHorseSession(1)
    const first = nextFeeding(session, session.performRoundEnd())
    expect(first.state.players[0]!.resources.food).toBe(3)
    const cooked = cookHorse(session, first, 1)
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[1]!.resources).toMatchObject({ horse: 0, food: 0, begging: 0 })
    // The reaction settles before the opponent heats and the owner pays for feeding.
    expect(cooked.state.players[0]!.resources).toMatchObject({ food: 4, begging: 0 })
    expect(cooked.state.events).toContainEqual(expect.objectContaining({
      type: 'harvest.feedConverted', playerId: session.state.players[1]!.id,
      cost: { horse: 1 }, food: { food: 2 },
    }))
    const ownerHeating = confirmHeating(session, cooked, 1)
    expect(ownerHeating.state.players[0]!.resources).toMatchObject({ food: 0, begging: 0 })
    const finished = confirmHeating(session, ownerHeating, 0)
    expect(finished.ok, finished.error).toBe(true)
    expect(finished.interaction.stateId).toBe('idle')
    expect(finished.state.round).toBe(5)
    expect(finished.state.players.map((player) => player.resources.begging)).toEqual([0, 0, 0, 0])
    expect(
      finished.state.log
        .filter((entry) => entry.key === 'log.harvestFeedDetail')
        .map((entry) => entry.params?.player)
        .toReversed(),
    ).toEqual([1, 2, 3, 0].map(index => session.state.players[index]!.name))
    expect(finished.state.log).toContainEqual(expect.objectContaining({
      key: 'log.harvestFeedDetail',
      params: expect.objectContaining({
        player: session.state.players[0]!.name, resources: expect.objectContaining({ food: 4 }),
      }),
    }))
    expect(
      finished.scores?.[0]?.categories.find((category) => category.key === 'cards')?.entries,
    ).toContainEqual(expect.objectContaining({ cardId: CARD_ID, score: 2 }))
  })

  it('does not reward the owner cooking a horse in Farmers of the Moor', () => {
    const session = moorHorseSession(0)
    const first = nextFeeding(session, session.performRoundEnd())
    expectFeed(first, 1)
    const opponentFed = session.resolveChoice(1, 'confirm', {
      selections: [{ sourceId: '__basic__', exchangeIndex: 0, count: 1 }],
    })
    const ownerFeed = confirmHeating(session, opponentFed, 1)
    const cooked = cookHorse(session, ownerFeed, 0)
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources).toMatchObject({ horse: 0, food: 0, begging: 0 })
    const finished = confirmHeating(session, cooked, 0)
    expect(finished.ok, finished.error).toBe(true)
    expect(finished.interaction.stateId).toBe('idle')
    expect(finished.state.round).toBe(5)
    expect(finished.state.players.map((player) => player.resources.food)).toEqual([0, 0, 0, 0])
  })

  it.each([
    { cookingPlayer: 0, animal: true, expectedFood: 3, expectedBegging: 0 },
    { cookingPlayer: 1, animal: false, expectedFood: 0, expectedBegging: 1 },
  ])('does not reward owner cooking or opponent vegetables: $cookingPlayer/$animal', ({
    cookingPlayer, animal, expectedFood, expectedBegging,
  }) => {
    const session = harvestSession((state) => {
      state.players[0]!.resources.food = 3
      const cook = state.players[cookingPlayer]!
      cook.improvements = ['Major_Fireplace1']
      if (animal) {
        cook.resources.sheep = 2
        cook.pastures = [{
          id: 'sheep',
          tiles: [{ row: 0, col: 1 }],
          animalType: 'sheep',
          animalCount: 2,
        }]
      } else cook.resources.vegetable = 2
    })
    let response = nextFeeding(session, session.performRoundEnd())
    if (cookingPlayer === 0) {
      for (const index of [1, 2, 3]) {
        expectFeed(response, index)
        response = nextFeeding(session, session.resolveChoice(index, 'confirm', { selections: [] }))
      }
    }
    const request = expectFeed(response, cookingPlayer)
    const recipe = request.exchangeCatalog?.find(
      (entry) => entry.sourceId === 'Major_Fireplace1' &&
        (animal ? entry.from.sheep === 1 : entry.from.vegetable === 1),
    )
    expect(recipe).toBeDefined()
    response = nextFeeding(session, session.resolveChoice(cookingPlayer, 'confirm', {
      selections: [{
        sourceId: recipe!.sourceId,
        exchangeIndex: recipe!.exchangeIndex,
        count: 2,
      }],
    }))
    const finished = finishFeeding(session, response).response
    expect(finished.state.players[0]!.resources).toMatchObject({
      food: expectedFood,
      begging: expectedBegging,
    })
  })
})
