import { describe, expect, it } from 'vitest'
import type { GameState, ResourceKey } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { captureStateWithHistory } from '../../shared/session/history-streams'
import { bonusScore, playImprovement, restoreSession } from './_helpers/card-play-lifecycle'
import { markAllWorkersUsed } from '../../shared/domain/player'

// Shared Exchange mechanism: ordered payments and retryable input cross the
// authoritative Session boundary, rather than calling individual listeners.
const createSession = (configure?: (state: GameState) => void, moor = false) =>
  createWorkSession({
    seed: 42,
    options: { playerCount: 2, enableFarmersOfTheMoor: moor },
    configure: (state) => {
      state.round = 4
      for (const player of state.players) {
        player.minorHand = ['__test_placeholder__']
        player.occupationHand = ['__test_placeholder__']
        player.resources.food = 0
        player.farmTerrain = []
      }
      const player = state.players[0]!
      player.improvements = ['Major_Fireplace1']
      player.resources.sheep = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'sheep' }
      configure?.(state)
    },
  })

const exchangeIndex = (response: SessionResponse, sourceId: string, resource: ResourceKey): number => {
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
    throw new Error('Expected an exchange choice')
  }
  const option = response.interaction.request.options.find((entry) =>
    entry.sourceCard === sourceId && (entry.effectPreview?.resourcesPaid?.[resource] ?? 0) > 0,
  )
  if (!option) throw new Error(`Missing ${sourceId} exchange paying ${resource}: ${JSON.stringify(response.interaction)}`)
  return Number(option.value.split(':')[1])
}

const assertRejectedUnchanged = (session: GameSession, choice: string, playerIndex = 0, payload?: Record<string, unknown>) => {
  const beforeResponse = session.getState()
  const before = {
    state: captureStateWithHistory(beforeResponse.state),
    interaction: structuredClone(beforeResponse.interaction),
    scores: structuredClone(beforeResponse.scores),
    historyLength: beforeResponse.historyLength,
    hasActionStartSnapshot: beforeResponse.hasActionStartSnapshot,
  }
  const response = session.resolveChoice(playerIndex, choice, payload)
  expect(response.ok).toBe(false)
  expect(captureStateWithHistory(response.state)).toEqual(before.state)
  expect(response.interaction).toEqual(before.interaction)
  expect(response.scores).toEqual(before.scores)
  expect(response.historyLength).toBe(before.historyLength)
  expect(response.hasActionStartSnapshot).toBe(before.hasActionStartSnapshot)
  expect(captureStateWithHistory(session.getState().state)).toEqual(before.state)
}

const enterFeeding = (session: GameSession): SessionResponse => {
  for (const player of session.state.players) markAllWorkersUsed(session.state, player)
  session.loadState(session.state)
  let response = session.performRoundEnd()
  for (let guard = 0; guard < 16 && response.interaction.stateId === 'wait' &&
    response.interaction.request.kind !== 'feed'; guard++) {
    const request = response.interaction.request
    if (request.kind !== 'choice' || !request.options.some((entry) => entry.value === '__skip__')) {
      throw new Error(`Unexpected harvest preparation ${JSON.stringify(response.interaction)}`)
    }
    response = session.resolveChoice(response.interaction.playerIndex, '__skip__')
    expect(response.ok, response.error).toBe(true)
  }
  expect(response.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
  return response
}

const feedSelection = (response: SessionResponse, sourceId: string, resource: ResourceKey, count = 1, gained?: ResourceKey) => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'feed') {
    throw new Error('Expected authoritative feeding catalog')
  }
  const recipe = response.interaction.request.exchangeCatalog?.find((entry) => entry.sourceId === sourceId &&
    (entry.from[resource] ?? 0) > 0 && (!gained || (entry.to[gained] ?? 0) > 0))
  if (!recipe) throw new Error(`Missing feeding recipe ${sourceId} paying ${resource}`)
  return { sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count }
}

const finishFeeding = (session: GameSession, response: SessionResponse) =>
  response.interaction.stateId === 'wait' && response.interaction.request.kind === 'feed'
    ? session.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] }) : response

describe('authoritative Exchange Batch', () => {
  it('rejects a feeding-only exchange in post-reap anytime and permits it after the real feeding boundary', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = []
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.vegetable = 2
      player.minorPlayed = ['E027_PiggyBank']
      player.cardStates.E027_PiggyBank = { counters: { food: 6 } }
      player.occupationPlayed = ['C109_SchnappsDistiller']
      state.players[1]!.resources.food = 4
      for (const owner of state.players) markAllWorkersUsed(state, owner)
    })
    const postReap = session.performRoundEnd()
    expect(postReap.ok, postReap.error).toBe(true)
    expect(postReap.state.roundPhase).toBe('harvest')
    expect(session.peekEnginePendingEnvelope()?.syntheticKind).toBe('post-reap-anytime')
    expect(postReap.state.events.some((event) => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'feeding')).toBe(false)
    expect(postReap.interaction.anytimeActions.map((entry) => entry.id)).toContain('E27-piggy-bank-anytime')
    const before = {
      state: captureStateWithHistory(postReap.state), interaction: structuredClone(postReap.interaction),
      scores: structuredClone(postReap.scores), historyLength: postReap.historyLength,
      hasActionStartSnapshot: postReap.hasActionStartSnapshot,
    }
    const rejected = session.takeAnytimeAction(0, 'exchange')
    expect(rejected.ok).toBe(false)
    expect(captureStateWithHistory(rejected.state)).toEqual(before.state)
    expect(rejected.interaction).toEqual(before.interaction)
    expect(rejected.scores).toEqual(before.scores)
    expect(rejected.historyLength).toBe(before.historyLength)
    expect(rejected.hasActionStartSnapshot).toBe(before.hasActionStartSnapshot)
    expect(rejected.interaction.anytimeActions.map((entry) => entry.id)).not.toContain('exchange')
    const feeding = session.resolveChoice(0, '__skip__')
    expect(feeding.ok, feeding.error).toBe(true)
    expect(feeding.state.roundPhase).toBe('feeding')
    expect(feeding.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    const exchanged = session.resolveChoice(0, 'confirm', {
      selections: [feedSelection(feeding, 'C109_SchnappsDistiller', 'vegetable')],
    })
    expect(exchanged.ok, exchanged.error).toBe(true)
    expect(exchanged.interaction).toMatchObject({ request: { maxTradeTimesBySourceId: { C109_SchnappsDistiller: 0 } } })
    const settled = finishFeeding(session, exchanged)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.round).toBe(5)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 1, vegetable: 1, begging: 0 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged' && event.exchangeSource === 'C109_SchnappsDistiller'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', paid: { vegetable: 1 }, gained: { food: 5 }, times: 1 })])
    expect(settled.state.events.filter((event) => event.type === 'resource.paid' && event.actorPlayerId === 'p1' && event.paymentFor === 'feeding')).toHaveLength(1)
    expect(settled.state.log.filter((entry) => entry.key === 'log.harvestFeedDetail' && entry.playerId === 'p1')).toHaveLength(1)
    expect(bonusScore(settled, 'C109_SchnappsDistiller')).toBe(0)
    session.dispose()
  })

  it('preserves an explicitly authorized harvest preparation exchange and its shared feeding limit', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = []
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.food = 6
      player.resources.grain = 0
      player.resources.vegetable = 1
      player.occupationPlayed = ['C105_BasketCarrier', 'C110_HomeBrewer', 'C109_SchnappsDistiller']
      state.players[1]!.resources.food = 4
      for (const owner of state.players) markAllWorkersUsed(state, owner)
    })
    const preparation = session.performRoundEnd()
    expect(preparation.ok, preparation.error).toBe(true)
    expect(preparation.state.roundPhase).toBe('harvest')
    expect(preparation.state.events.some((event) => event.type === 'harvest.phaseStarted')).toBe(false)
    const index = exchangeIndex(preparation, 'C105_BasketCarrier', 'food')
    const prepared = session.resolveChoice(0, `trade:${index}:1`)
    expect(prepared.ok, prepared.error).toBe(true)
    expect(prepared.state.players[0]!.resources).toMatchObject({ food: 4, wood: 1, reed: 1, grain: 1 })
    if (prepared.interaction.stateId !== 'wait' || prepared.interaction.request.kind !== 'choice') {
      throw new Error('Expected the real Home Brewer harvest opportunity')
    }
    const brew = prepared.interaction.request.options.find((option) => option.effectPreview?.resourcesGained?.food === 3)
    if (!brew) throw new Error('Expected one grain for three food')
    const feeding = session.resolveChoice(0, brew.value)
    expect(feeding.ok, feeding.error).toBe(true)
    expect(feeding.interaction).toMatchObject({
      stateId: 'wait', playerIndex: 0, request: { kind: 'feed', maxTradeTimesBySourceId: { C105_BasketCarrier: 0 } },
    })
    expect(feeding.state.players[0]!.resources).toMatchObject({ food: 3, wood: 1, reed: 1, grain: 0 })
    expect(feeding.state.players[0]!.cardStates.C105_BasketCarrier?.extraData?.harvestExchangeUsage).toEqual({ round: 4, count: 1 })
    assertRejectedUnchanged(session, 'confirm', 0, {
      selections: [feedSelection(feeding, 'C105_BasketCarrier', 'food')],
    })
    const settled = finishFeeding(session, session.getState())
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.round).toBe(5)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 3, wood: 1, reed: 1, grain: 0, vegetable: 1, begging: 0 })
    const exchanges = settled.state.events.filter((event) => event.type === 'resource.exchanged' && event.exchangeSource === 'C105_BasketCarrier')
    expect(exchanges).toEqual([expect.objectContaining({ actorPlayerId: 'p1', paid: { food: 2 }, gained: { wood: 1, reed: 1, grain: 1 }, times: 1 })])
    const feedingStarted = settled.state.events.find((event) => event.type === 'harvest.phaseStarted' && event.harvestPhase === 'feeding')!
    expect(exchanges[0]!.seq).toBeLessThan(feedingStarted.seq)
    expect(bonusScore(settled, 'C110_HomeBrewer')).toBe(0)
    session.dispose()
  })

  it('lets a completed feeding reaction fund a new batch without replaying prepaid food', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M115_OakBark']
      player.improvements.push('Major_Moor_FurnitureStall')
      player.resources.sheep = 0
      player.resources.boar = 1
      player.resources.food = 2
      player.resources.fuel = 2
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
    }, true)
    const pending = enterFeeding(session)
    const cooking = feedSelection(pending, 'Major_Fireplace1', 'boar')
    const furniture = feedSelection(pending, 'Major_Moor_FurnitureStall', 'wood')
    assertRejectedUnchanged(session, 'confirm', 0, { selections: [cooking, furniture] })
    const opportunity = session.resolveChoice(0, 'confirm', { selections: [cooking] })
    expect(opportunity.state.players[0]!.resources).toMatchObject({ food: 2, wood: 1, clay: 0 })
    const settled = finishFeeding(session, session.resolveChoice(0, 'confirm', { selections: [furniture] }))
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, clay: 1, begging: 0 })
    expect(settled.state.events.filter((event) => event.type === 'harvest.feedConverted')).toHaveLength(2)
    expect(settled.state.events.filter((event) => event.type === 'resource.paid' &&
      event.actorPlayerId === settled.state.players[0]!.id && event.paymentFor === 'feeding')).toHaveLength(1)
    session.dispose()
  })

  it.each([true, false])('lets Plow Builder decline after a feeding Joinery use, played=%s', (played) => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Joinery']
      if (played) player.occupationPlayed = ['E091_PlowBuilder']
      else player.occupationHand = ['E091_PlowBuilder']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.wood = 1
      player.resources.food = 3
      state.players[1]!.resources.food = 4
    })
    const pending = enterFeeding(session)
    expect(pending.interaction.anytimeActions.map((action) => action.id)).not.toContain('E91-plow-builder-anytime')
    const exchanged = session.resolveChoice(0, 'confirm', { selections: [feedSelection(pending, 'Major_Joinery', 'wood')] })
    expect(exchanged.interaction.anytimeActions.map((action) => action.id).includes('E91-plow-builder-anytime')).toBe(played)
    const settled = finishFeeding(session, exchanged)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0, begging: 0 })
    expect(settled.state.players[0]!.fields).toEqual([])
    expect(settled.state.events.filter((event) => event.type === 'farm.fieldPlowed')).toHaveLength(0)
    session.dispose()
  })

  it('keeps an earlier harvest craft payment spent when the feeding window is restored and retried', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Joinery']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.wood = 2
      player.resources.grain = 1
      state.players[1]!.resources.food = 4
    })
    for (const player of session.state.players) markAllWorkersUsed(session.state, player)
    session.loadState(session.state)
    const offered = session.performRoundEnd()
    if (offered.interaction.stateId !== 'wait' || offered.interaction.request.kind !== 'choice') {
      throw new Error('Expected the native Joinery harvest opportunity')
    }
    const use = offered.interaction.request.options.find((entry) => entry.value !== '__skip__')!
    const pending = session.resolveChoice(0, use.value)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    expect(pending.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0 })
    const usedRecipe = feedSelection(pending, 'Major_Joinery', 'wood')
    const restored = restoreSession(session)
    assertRejectedUnchanged(restored, 'confirm', 0, { selections: [usedRecipe] })
    const settled = restored.resolveChoice(0, 'confirm', { selections: [] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ wood: 1, food: 0, grain: 1, begging: 2 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged' &&
      event.exchangeSource === 'Major_Joinery')).toHaveLength(1)
    restored.dispose()
    session.dispose()
  })

  it('uses runtime anytime and harvest recipes from the same authoritative catalog with separate harvest usage', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C062_CookeryExtension', 'M107_PotRoastRecipe']
      player.resources.horse = 1
      player.pastures = [{ id: 'horse', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0, animalType: 'horse', animalCount: 1 }]
      player.resources.fuel = 2
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
    }, true)
    const pending = enterFeeding(session)
    const extensionSource = 'C062_CookeryExtension::Major_Fireplace1'
    const extension = feedSelection(pending, extensionSource, 'sheep')
    const roast = feedSelection(pending, 'M107_PotRoastRecipe', 'horse')
    const settled = finishFeeding(session, session.resolveChoice(0, 'confirm', { selections: [extension, roast] }))
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, horse: 0, food: 2, begging: 0 })
    expect(settled.state.players[0]!.cardStates[extensionSource]?.extraData?.harvestExchangeUsage).toEqual({ round: 4, count: 1 })
    expect(settled.state.players[0]!.cardStates.M107_PotRoastRecipe?.extraData?.harvestExchangeUsage).toBeUndefined()
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged').map((event) => event.exchangeSource))
      .toEqual([extensionSource, 'M107_PotRoastRecipe'])
    session.dispose()
  })

  it.each([
    { useJoinery: true, reward: 'food', inHand: false, offers: 2, food: 2, fuel: 0 },
    { useJoinery: true, reward: 'fuel', inHand: false, offers: 2, food: 0, fuel: 2 },
    { useJoinery: false, reward: 'food', inHand: false, offers: 3, food: 3, fuel: 0 },
    { useJoinery: false, reward: 'decline', inHand: false, offers: 3, food: 0, fuel: 0 },
    { useJoinery: false, reward: 'food', inHand: true, offers: 0, food: 0, fuel: 0 },
  ] as const)('rewards only unused craft buildings after real feeding and heating ($reward, used=$useJoinery, hand=$inHand)', ({ useJoinery, reward, inHand, offers, food, fuel }) => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Joinery', 'Major_Pottery', 'Major_Basket']
      if (inHand) player.minorHand = ['M091_RoutineWork']
      else player.minorPlayed = ['M091_RoutineWork']
      player.cardStates.M091_RoutineWork = { extraData: { usedCraftBuildingIds: ['Major_Basket'] } }
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.wood = useJoinery ? 1 : 0
      player.resources.food = useJoinery ? 2 : 4
      player.resources.fuel = 2
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
    }, true)
    let response = enterFeeding(session)
    response = session.resolveChoice(0, 'confirm', { selections: useJoinery
      ? [feedSelection(response, 'Major_Joinery', 'wood')] : [] })
    let active = session
    let restored: GameSession | undefined
    let offerCount = 0
    for (let step = 0; step < 24 && response.state.round === 4; step++) {
      expect(response.ok, response.error).toBe(true)
      if (response.interaction.stateId !== 'wait') throw new Error('Expected a harvest continuation')
      const request = response.interaction.request
      if (request.kind === 'feed') response = active.resolveChoice(response.interaction.playerIndex, 'confirm', { selections: [] })
      else if (request.kind === 'heating') response = active.resolveChoice(response.interaction.playerIndex, 'confirm', { fuelUsed: request.required, woodToFuel: 0 })
      else if (request.kind === 'choice' && response.interaction.sourceCard === 'M091_RoutineWork') {
        const choice = reward === 'decline' ? '__skip__' : request.options.find((entry) =>
          entry.effectPreview?.resourcesGained?.[reward] === 1)?.value
        if (!choice) throw new Error('Expected the Routine Work reward')
        if (offerCount === 0) {
          const interaction = structuredClone(response.interaction)
          restored = restoreSession(active)
          active = restored
          expect(active.getState().interaction).toEqual(interaction)
          expect(active.resolveChoice(0, choice).ok).toBe(true)
          const undone = active.undoStep()
          expect(undone.ok, undone.error).toBe(true)
          expect(undone.interaction).toEqual(interaction)
          expect(undone.state.players[0]!.resources).toMatchObject({ food: 0, fuel: 0 })
        }
        offerCount++
        response = active.resolveChoice(0, choice)
      } else if (request.kind === 'choice') response = active.resolveChoice(response.interaction.playerIndex, '__skip__')
      else throw new Error(`Unexpected harvest interaction ${request.kind}`)
    }
    expect(response.state.round).toBe(5)
    expect(offerCount).toBe(offers)
    expect(response.state.players[0]!.resources).toMatchObject({ food, fuel, wood: 0, begging: 0 })
    expect(response.state.events.filter((event) => event.type === 'resource.exchanged' &&
      event.exchangeSource === 'Major_Joinery')).toHaveLength(useJoinery ? 1 : 0)
    expect(bonusScore(response, 'M091_RoutineWork')).toBe(0)
    restored?.dispose()
    session.dispose()
  })

  it('shares the harvest limit across cancelled, duplicate, ordinary and feeding submissions', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Joinery']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.wood = 3
      state.players[1]!.resources.food = 4
    })
    expect(session.getState().interaction.anytimeActions.map((entry) => entry.id)).not.toContain('exchange')
    const pending = enterFeeding(session)
    const selection = feedSelection(pending, 'Major_Joinery', 'wood')
    const opened = session.takeAnytimeAction(0, 'exchange')
    const index = exchangeIndex(opened, 'Major_Joinery', 'wood')
    expect(session.resolveChoice(0, 'cancel').ok).toBe(true)
    const reopened = session.takeAnytimeAction(0, 'exchange')
    expect(exchangeIndex(reopened, 'Major_Joinery', 'wood')).toBe(index)
    assertRejectedUnchanged(session, `bulk:${index}=1,${index}=1`)
    const exchanged = session.resolveChoice(0, `bulk:${index}=1`)
    expect(exchanged.ok, exchanged.error).toBe(true)
    expect(exchanged.state.players[0]!.resources).toMatchObject({ wood: 2, food: 2 })
    assertRejectedUnchanged(session, 'confirm', 0, { selections: [selection] })
    expect(session.getState().interaction.anytimeActions.map((entry) => entry.id)).not.toContain('exchange')
    const settled = finishFeeding(session, session.getState())
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ wood: 2, food: 0, begging: 2 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged' &&
      event.exchangeSource === 'Major_Joinery')).toHaveLength(1)
    session.dispose()
  })

  it('keeps the feeding settlement open for Plow Builder payment and recoverable plowing', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Joinery']
      player.occupationPlayed = ['E091_PlowBuilder']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.wood = 1
      player.resources.food = 3
      state.players[1]!.resources.food = 4
    })
    const pending = enterFeeding(session)
    const exchanged = session.resolveChoice(0, 'confirm', { selections: [feedSelection(pending, 'Major_Joinery', 'wood')] })
    expect(exchanged.ok, exchanged.error).toBe(true)
    expect(exchanged.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    expect(exchanged.interaction.anytimeActions.map((action) => action.id)).toContain('E91-plow-builder-anytime')
    expect(exchanged.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0, begging: 0 })
    const plowing = session.takeAnytimeAction(0, 'E91-plow-builder-anytime')
    expect(plowing.ok, plowing.error).toBe(true)
    expect(plowing.state.players[0]!.resources.food).toBe(1)
    expect(plowing.interaction.anytimeActions.map((action) => action.id)).not.toContain('E91-plow-builder-anytime')
    const restored = restoreSession(session)
    expect(restored.getState().interaction).toEqual(plowing.interaction)
    if (plowing.interaction.stateId !== 'wait' || plowing.interaction.request.kind !== 'farm-select' ||
      plowing.interaction.request.farm.farmType !== 'plow') throw new Error('Expected Plow Builder field selection')
    const tile = plowing.interaction.request.farm.selectableTiles[0]!
    let plowed = restored.commitSelectionChoice(0, { tile })
    expect(plowed.ok, plowed.error).toBe(true)
    expect(plowed.state.players[0]!.fields).toContainEqual(expect.objectContaining(tile))
    expect(plowed.interaction.anytimeActions.map((action) => action.id)).not.toContain('E91-plow-builder-anytime')
    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(plowing.interaction)
    expect(undone.state.players[0]!.resources).toMatchObject({ food: 1, wood: 0 })
    expect(undone.state.players[0]!.fields).toEqual([])
    plowed = restored.commitSelectionChoice(0, { tile })
    expect(plowed.ok, plowed.error).toBe(true)
    const settled = restored.resolveChoice(0, 'confirm', { selections: [] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 0, wood: 0, begging: 0 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged' &&
      event.exchangeSource === 'Major_Joinery')).toHaveLength(1)
    expect(settled.state.events.filter((event) => event.type === 'resource.paid' &&
      event.actorPlayerId === settled.state.players[0]!.id && event.paymentFor === 'feeding')).toHaveLength(1)
    expect(settled.state.events.filter((event) => event.type === 'farm.fieldPlowed')).toHaveLength(1)
    restored.dispose()
    session.dispose()
  })

  it('offers the same declared Joinery recipe during feeding after declining its earlier harvest opportunity', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Joinery']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.wood = 1
      player.resources.food = 3
      state.players[1]!.resources.food = 4
    })
    const pending = enterFeeding(session)
    const joinery = feedSelection(pending, 'Major_Joinery', 'wood')
    const settled = session.resolveChoice(0, 'confirm', { selections: [joinery] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ wood: 0, food: 1, begging: 0 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged' &&
      event.exchangeSource === 'Major_Joinery')).toMatchObject([{ paid: { wood: 1 }, gained: { food: 2 }, times: 1 }])
    session.dispose()
  })

  it('finishes batch reactions before placing remaining animals and paying for feeding', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M081_PeatBoat', 'C053_GypsysCrock']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.fuel = 6
      player.resources.wood = 2
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
    }, true)
    const pending = enterFeeding(session)
    const peat = feedSelection(pending, 'M081_PeatBoat', 'fuel', 3, 'sheep')
    const sheep = feedSelection(pending, 'Major_Fireplace1', 'sheep', 2)
    const placing = session.resolveChoice(0, 'confirm', { selections: [peat, sheep] })
    expect(placing.ok, placing.error).toBe(true)
    expect(placing.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'animal-reorg' } })
    expect(placing.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 5, begging: 0 })
    expect(placing.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)
    expect(placing.state.events.filter((event) => event.type === 'resource.paid' &&
      event.actorPlayerId === placing.state.players[0]!.id && event.paymentFor === 'feeding')).toHaveLength(0)
    if (placing.interaction.stateId !== 'wait' || placing.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected remaining sheep placement')
    }
    const settled = finishFeeding(session, session.resolveChoice(0, 'confirm', { zones: placing.interaction.request.zones }))
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating' } })
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 1, begging: 0 })
    session.dispose()
  })

  it('settles the same ordered Peat Boat recipe chain through feeding', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M081_PeatBoat']
      player.resources.sheep = 0
      player.houseAnimals = {}
      player.resources.fuel = 2
      player.resources.wood = 2
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
    }, true)
    const pending = enterFeeding(session)
    const peat = feedSelection(pending, 'M081_PeatBoat', 'fuel', 1, 'sheep')
    const sheep = feedSelection(pending, 'Major_Fireplace1', 'sheep')
    assertRejectedUnchanged(session, 'confirm', 0, { selections: [sheep, peat] })
    assertRejectedUnchanged(session, 'confirm', 0, { selections: [peat, { ...sheep, count: 2 }] })
    const settled = finishFeeding(session, session.resolveChoice(0, 'confirm', { selections: [peat, sheep] }))
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'heating' } })
    expect(settled.state.players[0]!.resources).toMatchObject({ fuel: 0, sheep: 0, food: 0, begging: 2, wood: 2 })
    expect(settled.state.events.filter((event) => event.type === 'harvest.feedConverted')).toMatchObject([
      { source: 'M081_PeatBoat', cost: { fuel: 2 }, food: { sheep: 1 } },
      { source: 'Major_Fireplace1', cost: { sheep: 1 }, food: { food: 2 } },
    ])
    session.dispose()
  })

  it.each([
    { ownerIndex: 0, inHand: false, converted: true, score: 0 },
    { ownerIndex: 0, inHand: true, converted: true, score: 0 },
    { ownerIndex: 1, inHand: false, converted: false, score: 3 },
    { ownerIndex: 1, inHand: true, converted: false, score: 0 },
  ])('preserves Breed Registry owner and hand-zone history during feeding, owner=$ownerIndex hand=$inHand', ({ ownerIndex, inHand, converted, score }) => {
    const cardId = 'D036_BreedRegistry'
    const session = createSession((state) => {
      state.players[0]!.resources.food = 2
      state.players[1]!.resources.food = 4
      const owner = state.players[ownerIndex]!
      if (inHand) owner.minorHand = [cardId]
      else owner.minorPlayed = [cardId]
      owner.cardStates[cardId] = { extraData: { boardSheep: ownerIndex === 0 ? 1 : 0, cardSheep: 0 } }
    })
    const pending = enterFeeding(session)
    let settled = session.resolveChoice(0, 'confirm', { selections: [feedSelection(pending, 'Major_Fireplace1', 'sheep')] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[ownerIndex]!.cardStates[cardId]?.extraData?.sheepConvertedToFood ?? false).toBe(converted)
    expect(bonusScore(settled, cardId, ownerIndex)).toBe(score)
    if (ownerIndex === 0 && inHand) {
      settled = playImprovement(session, cardId)
      expect(settled.state.players[0]!.minorPlayed).toContain(cardId)
      expect(bonusScore(settled, cardId)).toBe(0)
    }
    session.dispose()
  })

  it('rejects excess feeding quantities atomically and permits an exact retry', () => {
    const session = createSession((state) => { state.players[1]!.resources.food = 4 })
    const pending = enterFeeding(session)
    const selection = feedSelection(pending, 'Major_Fireplace1', 'sheep')
    for (const count of [2, 0, 0.5]) {
      assertRejectedUnchanged(session, 'confirm', 0, { selections: [{ ...selection, count }] })
    }
    assertRejectedUnchanged(session, 'confirm', 1, { selections: [selection] })
    assertRejectedUnchanged(session, 'confirm', 0, { selections: [selection, { ...selection, sourceId: '__unknown__' }] })
    const settled = session.resolveChoice(0, 'confirm', { selections: [selection] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 0, begging: 2 })
    expect(settled.scores?.[0]?.categories.find((category) => category.key === 'beggings')?.total).toBe(-6)
    expect(settled.state.events.filter((event) => event.type === 'harvest.feedConverted')).toHaveLength(1)
    expect(settled.state.events.filter((event) => event.type === 'resource.paid' &&
      event.actorPlayerId === settled.state.players[0]!.id && event.paymentFor === 'feeding')).toHaveLength(1)
    session.dispose()
  })

  it('grants Oak Bark wood before heating and restores or undoes that settlement without duplicate food payment', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M115_OakBark']
      player.improvements.push('Major_Moor_FurnitureStall')
      player.resources.sheep = 0
      player.resources.boar = 1
      player.resources.food = 2
      player.resources.fuel = 1
      player.resources.wood = 0
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
    }, true)
    const pending = enterFeeding(session)
    const selection = feedSelection(pending, 'Major_Fireplace1', 'boar')
    const furniture = feedSelection(pending, 'Major_Moor_FurnitureStall', 'wood')
    assertRejectedUnchanged(session, 'confirm', 0, { selections: [selection, furniture] })
    const opportunity = session.resolveChoice(0, 'confirm', { selections: [selection] })
    expect(opportunity.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, request: { kind: 'feed' } })
    expect(opportunity.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2, wood: 1, fuel: 1, begging: 0 })
    const restored = restoreSession(session)
    expect(restored.getState().interaction).toEqual(opportunity.interaction)
    const heating = finishFeeding(restored, restored.getState())
    expect(heating.ok, heating.error).toBe(true)
    expect(heating.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0,
      request: { kind: 'heating', required: 2, maxWoodConvertibleToFuel: 1 } })
    expect(heating.state.players[0]!.resources).toMatchObject({ boar: 0, food: 0, wood: 1, fuel: 1, begging: 0 })
    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(opportunity.interaction)
    expect(undone.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2, wood: 1, fuel: 1, begging: 0 })
    const reheated = finishFeeding(restored, undone)
    if (heating.interaction.stateId !== 'wait' || reheated.interaction.stateId !== 'wait') {
      throw new Error('Expected both original and repeated heating requests')
    }
    const { requestKey: originalKey, ...originalRequest } = heating.interaction
    const { requestKey: repeatedKey, ...repeatedRequest } = reheated.interaction
    expect(repeatedRequest).toEqual(originalRequest)
    expect(originalKey).toBeTypeOf('string')
    expect(repeatedKey).toBeTypeOf('string')
    expect(repeatedKey).not.toBe(originalKey)
    const settled = restored.resolveChoice(0, 'confirm', { fuelUsed: 2, woodToFuel: 1 })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ boar: 0, food: 0, wood: 0, fuel: 0, begging: 0 })
    expect(settled.state.players[0]!.sickWorkerIds ?? []).toEqual([])
    expect(settled.state.events.filter((event) => event.type === 'resource.paid' &&
      event.actorPlayerId === settled.state.players[0]!.id && event.paymentFor === 'feeding')).toHaveLength(1)
    expect(settled.state.events.filter((event) => event.type === 'resource.moved' &&
      event.sourceCardId === 'M115_OakBark')).toHaveLength(1)
    restored.dispose()
    session.dispose()
  })

  it('restores a feeding batch reaction and never repeats its exchange or prepaid food', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['E053_BoarSpear']
      player.occupationPlayed = ['B104_SheepWalker']
      player.resources.food = 2
      state.players[1]!.resources.food = 4
    })
    const pending = enterFeeding(session)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'feed') {
      throw new Error('Expected feed')
    }
    const walker = pending.interaction.request.exchangeCatalog?.find((entry) =>
      entry.sourceId === 'B104_SheepWalker' && entry.to.boar === 1,
    )
    if (!walker) throw new Error('Expected the real Sheep Walker recipe')
    const reacting = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: walker.sourceId, exchangeIndex: walker.exchangeIndex, count: 1 },
    ] })
    expect(reacting.ok, reacting.error).toBe(true)
    expect(reacting.interaction).toMatchObject({ stateId: 'wait', playerIndex: 0, sourceCard: 'E053_BoarSpear' })
    expect(reacting.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, food: 0, begging: 0 })
    expect(reacting.state.log.filter((entry) => entry.key === 'log.harvestFeedDetail')).toHaveLength(0)
    const restored = restoreSession(session)
    expect(restored.getState().interaction).toEqual(reacting.interaction)
    const selectSpear = (response: SessionResponse) => {
      if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'choice') {
        throw new Error('Expected optional Boar Spear')
      }
      const option = response.interaction.request.options.find((entry) => entry.value !== '__skip__')
      if (!option) throw new Error('Expected Boar Spear activation')
      return option.value
    }
    const spearPending = restored.resolveChoice(0, selectSpear(restored.getState()))
    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.interaction).toEqual(reacting.interaction)
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, food: 0, begging: 0 })
    expect(spearPending.ok, spearPending.error).toBe(true)
    const resumed = restored.resolveChoice(0, selectSpear(undone))
    const boar = exchangeIndex(resumed, 'E053_BoarSpear', 'boar')
    const settled = restored.resolveChoice(0, `bulk:${boar}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.round).toBe(5)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, food: 2, begging: 0 })
    expect(settled.state.events.filter((event) => event.type === 'harvest.feedConverted')).toHaveLength(1)
    expect(settled.state.log.filter((entry) => entry.key === 'log.harvestFeedDetail' &&
      entry.playerId === settled.state.players[0]!.id)).toHaveLength(1)
    restored.dispose()
    session.dispose()
  })

  it('completes the same cooking batch reaction before feeding payment', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C053_GypsysCrock']
      player.resources.sheep = 2
      player.houseAnimals = {}
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 2,
      }]
      state.players[1]!.resources.food = 4
    })
    const pending = enterFeeding(session)
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'feed') {
      throw new Error('Expected feed')
    }
    const recipe = pending.interaction.request.exchangeCatalog?.find((entry) =>
      entry.sourceId === 'Major_Fireplace1' && entry.from.sheep === 1,
    )
    if (!recipe) throw new Error('Expected authoritative sheep cooking recipe')
    const settled = session.resolveChoice(0, 'confirm', { selections: [
      { sourceId: recipe.sourceId, exchangeIndex: recipe.exchangeIndex, count: 2 },
    ] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 1, begging: 0 })
    expect(settled.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)
    expect(settled.scores?.[0]?.categories.find((category) => category.key === 'cards')?.entries.find((entry) =>
      entry.type === 'card' && entry.cardId === 'C053_GypsysCrock')?.score).toBe(1)
    expect(bonusScore(settled, 'C053_GypsysCrock')).toBe(0)
    expect(settled.state.log.filter((entry) => entry.key === 'log.harvestFeedConvert')).toHaveLength(1)
    expect(settled.state.log.filter((entry) => entry.key === 'log.actionDetail' &&
      entry.params?.action === 'actions.exchange.name')).toHaveLength(0)
    expect(settled.state.log.filter((entry) => entry.key === 'log.harvestFeedDetail' &&
      entry.playerId === settled.state.players[0]!.id)).toHaveLength(1)
    session.dispose()
  })

  it('does not combine two separate single-good cooking batches during feeding', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C053_GypsysCrock']
      player.resources.sheep = 2
      player.houseAnimals = {}
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 2,
      }]
      state.players[1]!.resources.food = 4
    })
    enterFeeding(session)
    const ordinary = session.takeAnytimeAction(0, 'exchange')
    const index = exchangeIndex(ordinary, 'Major_Fireplace1', 'sheep')
    const pending = session.resolveChoice(0, `bulk:${index}=1`)
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'feed' } })
    expect(pending.state.players[0]!.resources).toMatchObject({ sheep: 1, food: 2 })
    const settled = session.resolveChoice(0, 'confirm', { selections: [feedSelection(pending, 'Major_Fireplace1', 'sheep')] })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 0, begging: 0 })
    expect(settled.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)
    expect(settled.state.events.filter((event) => event.type === 'resource.moved' &&
      event.sourceCardId === 'C053_GypsysCrock')).toHaveLength(0)
    session.dispose()
  })

  it('rejects an overdrawn batch without consuming the choice, then settles the exact legal retry', () => {
    const session = createSession()
    const pending = session.takeAnytimeAction(0, 'exchange')
    const index = exchangeIndex(pending, 'Major_Fireplace1', 'sheep')
    assertRejectedUnchanged(session, `bulk:${index}=2`)
    assertRejectedUnchanged(session, `trade:${index}:2`)

    const settled = session.resolveChoice(0, `bulk:${index}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 2 })
    expect(Object.values(settled.state.players[0]!.houseAnimals)).not.toContain('sheep')
    const exchanged = settled.state.events.filter((event) => event.type === 'resource.exchanged')
    expect(exchanged).toMatchObject([{ paid: { sheep: 1 }, gained: { food: 2 }, times: 1 }])
    expect(settled.state.log.filter((entry) => entry.key === 'log.actionDetail')).toHaveLength(1)
    expect(settled.interaction.stateId).toBe('idle')
    expect(settled.scores).toBeDefined()
    session.dispose()
  })

  it('counts repeated recipe entries against the same acquisition allowance', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.occupationPlayed = ['B104_SheepWalker']
      player.minorPlayed = ['E053_BoarSpear']
      player.resources.boar = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 1,
      }]
    })
    const pending = session.takeAnytimeAction(0, 'exchange')
    const walker = exchangeIndex(pending, 'B104_SheepWalker', 'sheep')
    const reaction = session.resolveChoice(0, `trade:${walker}:1`)
    if (reaction.interaction.stateId !== 'wait' || reaction.interaction.request.kind !== 'choice') {
      throw new Error('Expected the optional Boar Spear reaction')
    }
    const useSpear = reaction.interaction.request.options.find((entry) => entry.value !== '__skip__')
    if (!useSpear) throw new Error('Expected Boar Spear to offer its exchange')
    const spearPending = session.resolveChoice(0, useSpear.value)
    const spear = exchangeIndex(spearPending, 'E053_BoarSpear', 'boar')
    assertRejectedUnchanged(session, 'bulk:1=1') // Fireplace is not this reaction's source.
    assertRejectedUnchanged(session, `bulk:${spear}=1,${spear}=1`)
    let settled = session.resolveChoice(0, `bulk:${spear}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 1, food: 4 })
    expect(settled.interaction.stateId).toBe('wait')
    if (settled.interaction.stateId !== 'wait' || settled.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected remaining boar placement')
    }
    settled = session.resolveChoice(0, 'confirm', { zones: settled.interaction.request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.events.filter((event) =>
      event.type === 'resource.exchanged' && event.exchangeSource === 'E053_BoarSpear',
    )).toMatchObject([{ paid: { boar: 1 }, gained: { food: 4 }, times: 1 }])
    session.dispose()
  })

  it('uses earlier recipe goods for later recipes, but rejects the reverse order atomically', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M081_PeatBoat']
      player.resources.sheep = 0
      player.resources.fuel = 2
      player.houseAnimals = {}
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') {
      throw new Error('Expected Peat Boat exchange')
    }
    const peat = pending.interaction.request.options.find((entry) =>
      entry.sourceCard === 'M081_PeatBoat' && entry.effectPreview?.resourcesGained?.sheep === 1,
    )
    if (!peat) throw new Error('Expected the fuel-to-sheep recipe')
    const peatIndex = Number(peat.value.split(':')[1])
    // Fireplace is the first owned source; its sheep recipe precedes Peat Boat.
    const sheepRecipeIndex = 0
    assertRejectedUnchanged(session, `bulk:${sheepRecipeIndex}=1,${peatIndex}=1`)
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1,${sheepRecipeIndex}=2`)
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1,999=1`)
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1`, 1)

    const settled = session.resolveChoice(0, `bulk:${peatIndex}=1,${sheepRecipeIndex}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ fuel: 0, sheep: 0, food: 2 })
    expect(settled.interaction.stateId).toBe('idle')
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged')).toMatchObject([
      { exchangeSource: 'M081_PeatBoat', paid: { fuel: 2 }, gained: { sheep: 1 }, times: 1 },
      { exchangeSource: 'Major_Fireplace1', paid: { sheep: 1 }, gained: { food: 2 }, times: 1 },
    ])
    expect(settled.state.players[0]!.stats?.resourcesConverted).toMatchObject({ fuel: 2, sheep: 1 })
    session.dispose()
  })

  it('does not turn newly acquired unplaced animals into a farmyard payment', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['M081_PeatBoat']
      player.occupationPlayed = ['B104_SheepWalker']
      player.resources.fuel = 2
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    const sheep = exchangeIndex(pending, 'Major_Fireplace1', 'sheep')
    const walker = exchangeIndex(pending, 'B104_SheepWalker', 'sheep')
    if (pending.interaction.stateId !== 'wait' || pending.interaction.request.kind !== 'choice') {
      throw new Error('Expected exchange choice')
    }
    const peat = pending.interaction.request.options.find((entry) =>
      entry.sourceCard === 'M081_PeatBoat' && entry.effectPreview?.resourcesGained?.sheep === 1,
    )
    if (!peat) throw new Error('Missing Peat Boat sheep recipe')
    const peatIndex = Number(peat.value.split(':')[1])
    assertRejectedUnchanged(session, `bulk:${peatIndex}=1,${sheep}=1,${walker}=1`)
    const settled = session.resolveChoice(0, `bulk:${peatIndex}=1,${sheep}=2`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ fuel: 0, sheep: 0, food: 4, boar: 0 })
    expect(Object.values(settled.state.players[0]!.houseAnimals)).not.toContain('sheep')
    expect(settled.interaction.stateId).toBe('idle')
    session.dispose()
  })

  it('cannot prepay a later recipe with an unclaimed batch reaction reward', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements.push('Major_Moor_FurnitureStall')
      player.minorPlayed = ['M115_OakBark']
      player.resources.sheep = 0
      player.resources.boar = 1
      player.resources.wood = 0
      player.resources.clay = 0
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
    }, true)
    const pending = session.takeAnytimeAction(0, 'exchange')
    const boar = exchangeIndex(pending, 'Major_Fireplace1', 'boar')
    // The owned Furniture Stall follows Fireplace's four anytime recipes.
    const furniture = 4
    assertRejectedUnchanged(session, `bulk:${boar}=1,${furniture}=1`)
    const cooked = session.resolveChoice(0, `bulk:${boar}=1`)
    expect(cooked.ok, cooked.error).toBe(true)
    expect(cooked.state.players[0]!.resources).toMatchObject({ boar: 0, food: 2, wood: 1, clay: 0 })
    expect(cooked.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'M115_OakBark',
    )).toHaveLength(1)

    const next = session.takeAnytimeAction(0, 'exchange')
    const wood = exchangeIndex(next, 'Major_Moor_FurnitureStall', 'wood')
    const settled = session.resolveChoice(0, `bulk:${wood}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ food: 2, wood: 0, clay: 1 })
    expect(settled.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'M115_OakBark',
    )).toHaveLength(1)
    session.dispose()
  })

  it('restores the same pending batch and closes cooking reactions once after undo and retry', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C053_GypsysCrock']
      player.resources.sheep = 2
      player.houseAnimals = {}
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 2,
      }]
    })
    const pending = session.takeAnytimeAction(0, 'exchange')
    const sheep = exchangeIndex(pending, 'Major_Fireplace1', 'sheep')
    const restored = restoreSession(session)
    expect(restored.getState().interaction).toEqual(pending.interaction)
    const expected = session.resolveChoice(0, `bulk:${sheep}=2`)
    const resumed = restored.resolveChoice(0, `bulk:${sheep}=2`)
    expect(expected.ok, expected.error).toBe(true)
    expect(resumed.ok, resumed.error).toBe(true)
    expect(resumed.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 5 })
    expect(resumed.state.players[0]!.resources).toEqual(expected.state.players[0]!.resources)
    expect(resumed.scores).toEqual(expected.scores)
    expect(resumed.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)

    const undone = restored.undoStep()
    expect(undone.ok, undone.error).toBe(true)
    expect(undone.state.players[0]!.resources).toMatchObject({ sheep: 2, food: 0 })
    expect(undone.interaction).toEqual(pending.interaction)
    const retried = restored.resolveChoice(0, `bulk:${sheep}=2`)
    expect(retried.ok, retried.error).toBe(true)
    expect(retried.state.players[0]!.resources).toMatchObject({ sheep: 0, food: 5 })
    expect(retried.state.events.filter((event) => event.type === 'resource.exchanged')).toHaveLength(1)
    expect(retried.state.events.filter((event) =>
      event.type === 'resource.moved' && event.sourceCardId === 'C053_GypsysCrock',
    )).toHaveLength(1)
    expect(retried.state.players[0]!.cardStates.C053_GypsysCrock?.extraData?.cookedCount).toBe(0)
    restored.dispose()
    session.dispose()
  })

  it.each([
    { horseFirst: false, bonus: 1, feeding: false, food: 6 },
    { horseFirst: true, bonus: 0, feeding: false, food: 6 },
    { horseFirst: false, bonus: 1, feeding: true, food: 2 },
    { horseFirst: true, bonus: 0, feeding: true, food: 2 },
  ])('uses each recipe\'s pre-payment horses for Leather Saddle, horse first=$horseFirst feeding=$feeding', ({ horseFirst, bonus, feeding, food }) => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.improvements = ['Major_Moor_Cookhouse1']
      player.minorPlayed = ['M069_LeatherSaddle']
      player.resources.sheep = 0
      player.resources.horse = 3
      player.resources.cattle = 1
      player.resources.fuel = 2
      state.players[1]!.resources.food = 4
      state.players[1]!.resources.fuel = 2
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'cattle' }
      player.pastures = [{
        id: 'horses', size: 2, tiles: [{ row: 0, col: 3 }, { row: 0, col: 4 }], stables: 0,
        animalType: 'horse', animalCount: 3,
      }]
    }, true)
    const pending = feeding ? enterFeeding(session) : session.takeAnytimeAction(0, 'exchange')
    let settled: SessionResponse
    if (feeding) {
      const cattle = feedSelection(pending, 'Major_Moor_Cookhouse1', 'cattle')
      const horse = feedSelection(pending, 'Major_Moor_Cookhouse1', 'horse')
      settled = session.resolveChoice(0, 'confirm', { selections: horseFirst ? [horse, cattle] : [cattle, horse] })
      settled = finishFeeding(session, settled)
    } else {
      const cattle = exchangeIndex(pending, 'Major_Moor_Cookhouse1', 'cattle')
      const horse = exchangeIndex(pending, 'Major_Moor_Cookhouse1', 'horse')
      settled = session.resolveChoice(0, `bulk:${horseFirst ? `${horse}=1,${cattle}=1` : `${cattle}=1,${horse}=1`}`)
    }
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ horse: 2, cattle: 0, food })
    expect(settled.state.players[0]!.pastures[0]!.animalCount).toBe(2)
    expect(bonusScore(settled, 'M069_LeatherSaddle')).toBe(bonus)
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged')).toHaveLength(2)
    session.dispose()
  })

  it('records every paid resource of a compound recipe and synchronizes its animal zones', () => {
    const session = createSession((state) => {
      const player = state.players[0]!
      player.minorPlayed = ['C050_StableYard']
      player.resources.boar = 1
      const room = player.roomTiles[0]!
      player.houseAnimals = { [`${room.row}-${room.col}`]: 'boar' }
      player.pastures = [{
        id: 'sheep', size: 1, tiles: [{ row: 0, col: 3 }], stables: 0,
        animalType: 'sheep', animalCount: 1,
      }]
    })
    const pending = session.takeAnytimeAction(0, 'exchange')
    const index = exchangeIndex(pending, 'C050_StableYard', 'sheep')
    let settled = session.resolveChoice(0, `bulk:${index}=1`)
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.resources).toMatchObject({ sheep: 0, boar: 0, cattle: 1, food: 0 })
    expect(settled.state.players[0]!.stats?.resourcesConverted).toMatchObject({ sheep: 1, boar: 1 })
    if (settled.interaction.stateId !== 'wait' || settled.interaction.request.kind !== 'animal-reorg') {
      throw new Error('Expected new cattle placement')
    }
    settled = session.resolveChoice(0, 'confirm', { zones: settled.interaction.request.zones })
    expect(settled.ok, settled.error).toBe(true)
    expect(settled.state.players[0]!.pastures[0]).toMatchObject({ animalType: 'cattle', animalCount: 1 })
    expect(settled.state.events.filter((event) => event.type === 'resource.exchanged')).toMatchObject([
      { exchangeSource: 'C050_StableYard', paid: { sheep: 1, boar: 1 }, gained: { cattle: 1 }, times: 1 },
    ])
    session.dispose()
  })
})
