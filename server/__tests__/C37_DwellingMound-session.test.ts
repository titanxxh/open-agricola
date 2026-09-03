import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'

import '../../shared/cards/C/C037_DwellingMound'
import '../../shared/cards/C/C158_ForestCampaigner'

const CARD_ID = 'C037_DwellingMound'
const FOREST_CAMPAIGNER_ID = 'C158_ForestCampaigner'

describe('C37 Dwelling Mound session', () => {
  it('attributes the additional food paid for plowing', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = { ...player.resources, food: 1 }
    session.loadState(state)

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)
    resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })

    expect(resp.ok).toBe(true)
    const after = resp.state.players[0]!
    expect(after.resources.food).toBe(0)
    expect(after.fields).toContainEqual(expect.objectContaining({ row: 0, col: 1 }))
    expect(readCardResourceStats(after, CARD_ID)?.paid).toEqual({ food: 1 })
  })

  it('does not record an unaffordable plow', () => {
    const session = new GameSession()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.resources = { ...player.resources, food: 0 }
    session.loadState(state)

    const beforeResponse = session.getState()
    expect(beforeResponse.actionAvailability?.farmland).toBe(false)
    const beforeTakenBy = structuredClone(
      beforeResponse.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy,
    )
    const beforeWorkers = structuredClone(beforeResponse.state.players[0]!.workers)
    const beforeFields = structuredClone(beforeResponse.state.players[0]!.fields)
    const rejected = session.takeAction(0, 'farmland')
    expect(rejected.ok).toBe(false)
    expect(rejected.error).toBe('space unavailable')
    expect(rejected.interaction.stateId).toBe('idle')
    expect(rejected.state.actionSpaces.find((space) => space.id === 'farmland')?.takenBy)
      .toEqual(beforeTakenBy)
    expect(rejected.state.players[0]!.workers).toEqual(beforeWorkers)
    expect(rejected.state.players[0]!.fields).toEqual(beforeFields)
    expect(rejected.state.players[0]!.resources.food).toBe(0)
    expect(readCardResourceStats(rejected.state.players[0]!, CARD_ID)).toBeUndefined()
  })

  it('allows Farmland when a before-placement gain makes the plow payable', () => {
    const session = new GameSession(42, undefined, { playerCount: 4 })
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push(CARD_ID)
    player.occupationPlayed.push(FOREST_CAMPAIGNER_ID)
    player.resources = { ...player.resources, food: 0 }
    for (const space of state.actionSpaces) {
      if (Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0)) {
        space.resources = { ...space.resources, wood: 0 }
      }
    }
    const forest = state.actionSpaces.find((space) => space.id === 'forest')!
    forest.resources = { ...forest.resources, wood: 7 }
    session.loadState(state)

    expect(session.getState().actionAvailability?.farmland).toBe(false)
    const eligibleState = session.getState().state
    const eligibleForest = eligibleState.actionSpaces.find((space) => space.id === 'forest')!
    eligibleForest.resources = { ...eligibleForest.resources, wood: 8 }
    session.loadState(eligibleState)

    expect(session.getState().actionAvailability?.farmland).toBe(true)
    let response = session.takeAction(0, 'farmland')
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(1)

    response = session.commitSelectionChoice(0, { tile: { row: 0, col: 1 } })
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(0)
    expect(response.state.players[0]!.fields).toContainEqual(expect.objectContaining({ row: 0, col: 1 }))
    expect(readCardResourceStats(response.state.players[0]!, FOREST_CAMPAIGNER_ID)?.gained)
      .toEqual({ food: 1 })
    expect(readCardResourceStats(response.state.players[0]!, CARD_ID)?.paid).toEqual({ food: 1 })
  })
})
