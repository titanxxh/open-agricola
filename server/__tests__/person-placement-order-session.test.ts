import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { familySize, setWorkersAtHome, workersAvailable } from '../../shared/domain/player'
import {
  getRoundPersonPlacementDetails,
  getRoundPlacementDetails,
  recordRoundPlacement,
} from '../../shared/cards/helpers/round-placement'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { runCardListeners } from '../../shared/cards/card-listeners'

import { A018_WheelPlow_impl } from '../../shared/cards/A/A018_WheelPlow'
import '../../shared/cards/A/A107_Catcher'
import '../../shared/cards/A/A129_Swagman'
import '../../shared/cards/A/A163_BuildingExpert'
import { C091_PlowHero_impl } from '../../shared/cards/C/C091_PlowHero'
import '../../shared/cards/C/C119_SkillfulRenovator'
import '../../shared/cards/D/D053_TeaHouse'
import '../../shared/cards/D/D094_HenpeckedHusband'
import '../../shared/cards/D/D150_GodlySpouse'

const A129_ID = 'A129_Swagman'

const commitFarmSelection = (
  session: GameSession,
  response: SessionResponse,
): SessionResponse | undefined => {
  if (response.interaction.stateId !== 'wait' || response.interaction.request.kind !== 'farm-select') return
  const farm = response.interaction.request.farm
  if (farm.farmType === 'room') {
    return session.commitSelectionChoice(0, { rooms: [farm.selectableTiles[0]!] })
  }
  if (farm.farmType === 'stable') {
    return session.commitSelectionChoice(0, { stables: [farm.selectableTiles[0]!] })
  }
}

const acceptA129Jump = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'farm-expansion')
  for (let remaining = 30; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const farmResponse = commitFarmSelection(session, response)
    if (farmResponse) {
      response = farmResponse
      continue
    }
    const options = response.interaction.request.options ?? []
    const choice = options.find((option) => option.sourceCard === A129_ID && option.value !== '__skip__')
      ?? (response.interaction.sourceCard === A129_ID
        ? options.find((option) => option.value !== '__skip__')
        : undefined)
      ?? options.find((option) => option.value === '__skip__' || option.value === '__done__')
      ?? options[0]
    if (!choice) break
    response = session.resolveChoice(0, choice.value)
  }
  expect(response.ok).toBe(true)
  expect(getRoundPlacementDetails(response.state.players[0]!)).toEqual([
    { spaceId: 'farm-expansion', workerId: '1' },
    { spaceId: 'grain-seeds', workerId: '1', relocation: true },
  ])
  expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
  return response
}

const acceptCardTrigger = (
  session: GameSession,
  initial: SessionResponse,
  cardId: string,
): SessionResponse => {
  let response = initial
  for (let remaining = 10; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const options = response.interaction.request.options ?? []
    const choice = options.find((option) => option.sourceCard === cardId && option.value !== '__skip__')
      ?? (response.interaction.sourceCard === cardId
        ? options.find((option) => option.value !== '__skip__')
        : undefined)
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const finishRenovation = (
  session: GameSession,
  initial: SessionResponse,
  cardId: string,
): SessionResponse => {
  let response = initial
  for (let remaining = 12; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const options = response.interaction.request.options ?? []
    const choice = response.interaction.promptKey === 'ui.interactionChooseRenovationTarget'
      ? options.find((option) => option.value === 'clay')
      : options.find((option) => option.sourceCard === cardId && option.value !== '__skip__')
        ?? (response.interaction.sourceCard === cardId
          ? options.find((option) => option.value !== '__skip__')
          : undefined)
        ?? options.find((option) => option.value === '__skip__' || option.value === 'skip')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const finishConstruction = (
  session: GameSession,
  initial: SessionResponse,
  cardId: string,
): SessionResponse => {
  let response = initial
  for (let remaining = 16; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const farmResponse = commitFarmSelection(session, response)
    if (farmResponse) {
      response = farmResponse
      continue
    }
    const options = response.interaction.request.options ?? []
    const choice = response.interaction.promptKey === 'ui.interactionFarmExpansionSelect'
      ? options.find((option) => option.labelKey === 'actions.construct.name')
      : options.find((option) => option.sourceCard === cardId && option.value !== '__skip__')
      ?? (response.interaction.sourceCard === cardId
        ? options.find((option) => option.value !== '__skip__')
        : undefined)
      ?? options.find((option) => option.value === '__skip__' || option.value === '__done__')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const finishFamilyGrowth = (
  session: GameSession,
  initial: SessionResponse,
  cardId: string,
): SessionResponse => {
  let response = initial
  for (let remaining = 12; remaining > 0 && response.interaction.stateId === 'wait'; remaining -= 1) {
    if (response.interaction.request.kind === 'confirm-next-player') break
    const options = response.interaction.request.options ?? []
    const choice = options.find((option) => option.labelKey === 'ui.interactionGodlySpouseUse')
      ?? options.find((option) => option.sourceCard === cardId && option.value !== '__skip__')
      ?? (response.interaction.sourceCard === cardId
        ? options.find((option) => option.value !== '__skip__')
        : undefined)
      ?? options.find((option) => option.value === '__skip__' || option.value === 'skip')
    if (!choice) break
    response = session.resolveChoice(response.interaction.playerIndex, choice.value)
  }
  return response
}

const setup = (cardId: string, playerCount = 2, zone: 'occupation' | 'minor' = 'occupation') => {
  const session = new GameSession(129, undefined, { playerCount })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 5
  for (const player of state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  for (const other of state.players.slice(1)) setWorkersAtHome(state, other, 0)
  player.resources = {
    ...player.resources,
    food: 20,
    grain: 2,
    wood: 20,
    clay: 20,
    reed: 20,
    stone: 20,
  }
  player.occupationPlayed.push(A129_ID)
  if (zone === 'minor') player.minorPlayed.push(cardId)
  else player.occupationPlayed.push(cardId)
  session.loadState(state)
  return session
}

const continueAsFirstPlayer = (session: GameSession, response: SessionResponse) => {
  expect(response.interaction.stateId === 'wait' ? response.interaction.request.kind : undefined)
    .toBe('confirm-next-player')
  const continued = session.resolveChoice(0, 'confirm')
  expect(continued.state.currentPlayerIndex).toBe(0)
  return continued
}

describe('person placement order after a same-person relocation', () => {
  it('A107 rewards the second person for collecting exactly four building resources', () => {
    const cardId = 'A107_Catcher'
    const session = setup(cardId)
    continueAsFirstPlayer(session, acceptA129Jump(session))
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'forest')!.resources.wood = 4
    const foodBefore = state.players[0]!.resources.food
    session.loadState(state)

    const response = session.takeAction(0, 'forest')

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(foodBefore + 1)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: cardId,
    }))
    expect(response.scores).toHaveLength(2)
  })

  it('A163 rewards clay when the second person uses Resource Market', () => {
    const cardId = 'A163_BuildingExpert'
    const session = setup(cardId, 4)
    continueAsFirstPlayer(session, acceptA129Jump(session))
    const resources = session.getState().state.players[0]!.resources
    const clayBefore = resources.clay
    const reedBefore = resources.reed

    const response = acceptCardTrigger(
      session,
      session.takeAction(0, 'resource-market-4'),
      cardId,
    )

    expect(response.ok).toBe(true)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: cardId,
    }))
    expect(response.state.players[0]!.resources.clay).toBe(clayBefore + 1)
    expect(response.state.players[0]!.resources.reed).toBe(reedBefore + 1)
    expect(response.scores).toHaveLength(4)
  })

  it('C119 rewards wood for two person placements after renovation', () => {
    const cardId = 'C119_SkillfulRenovator'
    const session = setup(cardId)
    const prepared = session.getState().state
    prepared.players[0]!.houseType = 'wood'
    session.loadState(prepared)
    continueAsFirstPlayer(session, acceptA129Jump(session))
    const woodBefore = session.getState().state.players[0]!.resources.wood

    const response = finishRenovation(
      session,
      session.takeAction(0, 'house-redevelopment'),
      cardId,
    )

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.houseType).toBe('clay')
    expect(response.state.players[0]!.resources.wood).toBe(woodBefore + 2)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: cardId,
    }))
    expect(response.scores).toHaveLength(2)
  })

  it('D053 remains available after the first person is relocated', () => {
    const cardId = 'D053_TeaHouse'
    const listenerId = 'D53-tea-house-anytime'
    const session = setup(cardId, 2, 'minor')
    const responseAfterJump = continueAsFirstPlayer(session, acceptA129Jump(session))
    const foodBefore = responseAfterJump.state.players[0]!.resources.food

    expect(responseAfterJump.interaction.anytimeActions.map((action) => action.id)).toContain(listenerId)
    const response = session.takeAnytimeAction(0, listenerId)

    expect(response.ok).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(foodBefore + 1)
    expect(response.state.players[0]!.cardStates?.[cardId]?.flagged).toBe(true)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(1)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: cardId,
    }))
    expect(response.scores).toHaveLength(2)
  })

  it('D094 recalls the relocated first person when the second person builds a room', () => {
    const cardId = 'D094_HenpeckedHusband'
    const session = setup(cardId)
    continueAsFirstPlayer(session, acceptA129Jump(session))

    const response = finishConstruction(
      session,
      session.takeAction(0, 'farm-expansion'),
      cardId,
    )

    expect(response.ok).toBe(true)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')?.takenBy)
      .toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'farm-expansion')?.takenBy)
      .toEqual([expect.objectContaining({ playerId: response.state.players[0]!.id, workerId: '2' })])
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: cardId,
    }))
    expect(response.scores).toHaveLength(2)
  })

  it('D150 recalls the relocated first person after second-person family growth', () => {
    const cardId = 'D150_GodlySpouse'
    const session = setup(cardId, 4)
    continueAsFirstPlayer(session, acceptA129Jump(session))

    const response = finishFamilyGrowth(
      session,
      session.takeAction(0, 'wish-children'),
      cardId,
    )

    expect(response.ok).toBe(true)
    expect(familySize(response.state.players[0]!)).toBe(3)
    expect(workersAvailable(response.state, response.state.players[0]!)).toBe(1)
    expect(response.state.actionSpaces.find((space) => space.id === 'grain-seeds')?.takenBy)
      .toEqual([])
    expect(response.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy)
      .toContainEqual(expect.objectContaining({ playerId: response.state.players[0]!.id, workerId: '2' }))
    expect(response.state.players[0]!.cardStates?.[cardId]?.flagged).toBe(true)
    expect(getRoundPersonPlacementDetails(response.state.players[0]!)).toHaveLength(2)
    expect(response.state.events).toContainEqual(expect.objectContaining({
      type: 'card.triggered',
      sourceCardId: cardId,
    }))
    expect(response.scores).toHaveLength(4)
  })

  it('A018 and C091 both recognize a relocated first person on Farmland', () => {
    const session = new GameSession(18, undefined, { playerCount: 2 })
    const state = session.getState().state
    const player = state.players[0]!
    player.minorPlayed.push('A018_WheelPlow')
    player.occupationPlayed.push('C091_PlowHero')
    recordRoundPlacement(player, 'farm-expansion', '1')
    recordRoundPlacement(player, 'farmland', '1', true)
    const space = state.actionSpaces.find((entry) => entry.id === 'farmland')!

    const placementResults = runCardListeners({
      state,
      player,
      space,
      actionId: 'place-farmer',
      phase: 'after',
    }, [A018_WheelPlow_impl.listeners[0]!, C091_PlowHero_impl.listeners[0]!])
    const plowResults = runCardListeners({
      state,
      player,
      space,
      actionId: 'plow',
      phase: 'after',
    }, [A018_WheelPlow_impl.listeners[0]!, C091_PlowHero_impl.listeners[0]!])

    expect(placementResults.map((result) => result.sourceCard)).toEqual(['C091_PlowHero'])
    expect(plowResults.map((result) => result.sourceCard)).toEqual(['A018_WheelPlow'])
    expect([...placementResults, ...plowResults].every((result) => result.flow !== undefined)).toBe(true)
  })
})
