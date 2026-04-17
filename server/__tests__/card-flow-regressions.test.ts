import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { recordRoundPlacement } from '../../shared/cards/helpers/round-placement'

import '../../shared/cards/A/A17_ReclamationPlow'
import '../../shared/cards/D/D150_GodlySpouse'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

describe('card flow regressions', () => {
  it('A17_ReclamationPlow still triggers after animal reorg resumes the collect flow', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A17_ReclamationPlow')
    player.playedCards.push(playedKey('A17_ReclamationPlow', 'minor'))

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.pending.type).toBe('animalReorg')

    resp = session.confirmAnimalReorg(0, [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionReclamationPlow')

    if (resp.pending.type !== 'choice') {
      throw new Error('expected reclamation plow choice')
    }
    const skip = resp.pending.options.find((option) => option.labelKey === 'ui.interactionReclamationPlowSkip')
    expect(skip).toBeDefined()

    resp = session.resolveChoice(0, skip!.value)
    expect(resp.state.players[0]!.cardStates?.A17_ReclamationPlow?.flagged).toBe(true)
    expect(resp.state.players[0]!.cardStates?.A17_ReclamationPlow?.infobox).toBe('✓')
    expect(resp.pending.type).toBe('confirmNextPlayer')
  })

  it('A17_ReclamationPlow does not prompt again after confirming the plow choice', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.minorPlayed.push('A17_ReclamationPlow')
    player.playedCards.push(playedKey('A17_ReclamationPlow', 'minor'))

    const sheepMarket = state.actionSpaces.find((space) => space.id === 'sheep-market')
    if (!sheepMarket) throw new Error('sheep-market missing')
    sheepMarket.resources.sheep = 1

    session.loadState(state)

    let resp = session.takeAction(0, 'sheep-market')
    expect(resp.pending.type).toBe('animalReorg')

    resp = session.confirmAnimalReorg(0, [
      { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
    ])
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionReclamationPlow')

    if (resp.pending.type !== 'choice') {
      throw new Error('expected reclamation plow choice')
    }

    const use = resp.pending.options.find((option) => option.labelKey === 'ui.interactionReclamationPlowUse')
    expect(use).toBeDefined()

    resp = session.resolveChoice(0, use!.value)
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionPlowSelect')
    expect(resp.interaction.stateId).toBe('farmSelect')
    if (resp.interaction.stateId !== 'farmSelect') {
      throw new Error('expected plow farm interaction')
    }

    const tile = resp.interaction.farm.selectableTiles[0]
    expect(tile).toBeDefined()

    resp = session.commitFarmChoice(0, 'plow', { tile })
    expect(resp.state.players[0]!.fields.length).toBe(1)
    expect(resp.state.players[0]!.cardStates?.A17_ReclamationPlow?.flagged).toBe(true)
    expect(resp.state.players[0]!.cardStates?.A17_ReclamationPlow?.infobox).toBe('✓')
    expect(resp.pending.type).not.toBe('choice')
  })

  it('D150_GodlySpouse returns the first placed worker based on round placement order', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.round = 2
    state.currentPlayerIndex = 0

    const player = state.players[0]!
    player.occupationPlayed.push('D150_GodlySpouse')
    player.playedCards.push(playedKey('D150_GodlySpouse', 'occupation'))
    player.rooms = 3
    player.workersAvailable = 1

    const forest = state.actionSpaces.find((space) => space.id === 'forest')
    const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
    if (!forest || !wishChildren) {
      throw new Error('required action spaces missing')
    }
    forest.takenBy = player.id
    recordRoundPlacement(player, 'forest', '1')

    session.loadState(state)

    let resp = session.takeAction(0, 'wish-children')
    expect(resp.pending.type).toBe('choice')
    expect(resp.pending.type === 'choice' ? resp.pending.promptKey : undefined)
      .toBe('ui.interactionGodlySpouse')

    if (resp.pending.type !== 'choice') {
      throw new Error('expected godly spouse choice')
    }
    const use = resp.pending.options.find((option) => option.labelKey === 'ui.interactionGodlySpouseUse')
    expect(use).toBeDefined()

    resp = session.resolveChoice(0, use!.value)
    expect(resp.state.players[0]!.familySize).toBe(3)
    expect(resp.state.players[0]!.workersAvailable).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'forest')?.takenBy).toEqual([])
    expect(resp.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy.some((t) => t.playerId === player.id)).toBe(true)
    expect(resp.state.players[0]!.cardStates?.D150_GodlySpouse?.flagged).toBe(true)
  })
})
