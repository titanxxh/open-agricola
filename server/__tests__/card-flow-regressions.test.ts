import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import { setWorkersAtHome, workersAvailable, familySize } from '../../shared/domain/player'
import '../../shared/cards/A/A017_ReclamationPlow'
import '../../shared/cards/D/D150_GodlySpouse'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

describe('card flow regressions', () => {
  it('A017_ReclamationPlow still triggers after animal reorg resumes the collect flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A017_ReclamationPlow')

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionReclamationPlow')

    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected reclamation plow choice')
    }
    const skip = resp.interaction.options?.find((option) => option.labelKey === 'ui.interactionOptionalSkip')
    expect(skip).toBeDefined()

    resp = session.resolveChoice(0, skip!.value)
    expect(resp.state.players[0]!.cardStates?.A017_ReclamationPlow?.flagged).toBeFalsy()
    expect(resp.state.players[0]!.cardStates?.A017_ReclamationPlow?.infobox).toBeUndefined()
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('A017_ReclamationPlow does not prompt again after confirming the plow choice', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A017_ReclamationPlow')

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.interaction.stateId).toBe('wait')

    resp = session.resolveChoice(0, 'confirm', [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionReclamationPlow')

    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected reclamation plow choice')
    }

    const use = resp.interaction.options?.find((option) => option.labelKey === 'ui.interactionReclamationPlowUse')
    expect(use).toBeDefined()

    resp = session.resolveChoice(0, use!.value)
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected plow farm interaction')
    }

    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitSelectionChoice(0, { tile })
    expect(resp.state.players[0]!.fields.length).toBe(1)
    expect(resp.state.players[0]!.cardStates?.A017_ReclamationPlow?.flagged).toBe(true)
    expect(resp.state.players[0]!.cardStates?.A017_ReclamationPlow?.infobox).toBe('✓')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  it('D150_GodlySpouse returns the first placed worker based on round placement order', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 2
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push('D150_GodlySpouse')
    player.rooms = 3
    const forest = state.actionSpaces.find((space) => space.id === 'forest')
    const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (!forest || !wishChildren) {
      throw new Error('required action spaces missing')
    }
    // Place worker '1' on forest; remaining active worker is at home.
    forest.takenBy = [{ playerId: player.id, workerId: '1' }]
    recordRoundPlacement(player, 'forest', '1')

    session.loadState(state)

    let resp = session.takeAction(0, 'wish-children')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionGodlySpouse')

    if (resp.interaction.stateId !== 'wait') {
      throw new Error('expected godly spouse choice')
    }
    const use = resp.interaction.options?.find((option) => option.labelKey === 'ui.interactionGodlySpouseUse')
    expect(use).toBeDefined()

    resp = session.resolveChoice(0, use!.value)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy).toEqual([])
    expect(resp.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy.some((t) => t.playerId === player.id)).toBe(true)
    expect(resp.state.players[0]!.cardStates?.D150_GodlySpouse?.flagged).toBe(true)
  })
})
