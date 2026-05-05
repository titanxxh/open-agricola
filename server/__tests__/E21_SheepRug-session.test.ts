import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setActiveWorkerCount, setWorkersAtHome, workersAvailable, familySize, newbornCount } from '../../shared/game/player'
import { E21_SheepRug } from '../../shared/cards/E/E21_SheepRug'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'
import { isLegacyChoicePending } from './_helpers/legacy-confirms'

const playedKey = (cardId: string, type: 'minor' | 'occupation') => `${type}:${cardId}`

const setup = (withSheepRug: boolean) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 2
  state.currentPlayerIndex = 0
  state.roundActionOrder = state.roundActionOrder.map((spaceId) =>
    spaceId === 'wish-children' ? null : spaceId,
  )
  state.roundActionOrder[0] = 'wish-children'

  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  setActiveWorkerCount(player, 2)
  player.rooms = 3
  player.minorHand = []

  if (withSheepRug) {
    player.minorPlayed.push('E21_SheepRug')
  }

  const wishChildren = state.actionSpaces.find((space) => space.id === 'wish-children')
  if (!wishChildren) throw new Error('wish-children space missing')
  wishChildren.takenBy = state.players[1]!.id

  session.loadState(state)
  return session
}

describe('E21_SheepRug session', () => {
  it('makes occupied wish-children available only when the card is played', () => {
    const withCard = setup(true).getState()
    expect(withCard.ok).toBe(true)
    expect(isLegacyChoicePending(withCard)).toBe(false)
    expect(withCard.actionAvailability?.['wish-children']).toBe(true)

    const withoutCardSession = setup(false)
    const withoutCard = withoutCardSession.getState()
    expect(withoutCard.actionAvailability?.['wish-children']).toBe(false)

    const failedTake = withoutCardSession.takeAction(0, 'wish-children')
    expect(failedTake.ok).toBe(false)
    expect(failedTake.error).toBe('space unavailable')
  })

  it('lets the player use occupied wish-children without overwriting the occupant', () => {
    const session = setup(true)

    let resp = session.takeAction(0, 'wish-children')
    expect(resp.ok).toBe(true)
    expect(['choice', 'confirmNextPlayer']).toContain(resp.pending.type)
    expect(familySize(resp.state.players[0]!)).toBe(3)
    expect(newbornCount(resp.state.players[0]!)).toBe(1)
    expect(workersAvailable(resp.state, resp.state.players[0]!)).toBe(1)
    expect(resp.state.actionSpaces.find((space) => space.id === 'wish-children')?.takenBy.some((t) => t.playerId === resp.state.players[1]!.id)).toBe(true)

    if (resp.interaction.stateId === 'wait') {
      const skipOption = resp.interaction.options?.find((option) => option.value === '__skip__')
      expect(skipOption).toBeDefined()

      resp = session.resolveChoice(0, skipOption!.value)
      expect(resp.ok).toBe(true)
    }

    expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
  })

  describe('prerequisite "4 Sheep"', () => {
    it('blocks when player has fewer than 4 sheep on board', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.pastures = []
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      player.stableAnimals = {}
      expect(meetsCardPrerequisites(player, E21_SheepRug, state.round, state)).toBe(false)
    })

    it('allows when player has 4+ sheep on board (in pasture)', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.pastures = [{
        id: 'p1',
        tiles: [{ row: 0, col: 0 }, { row: 1, col: 0 }],
        animalType: 'sheep',
        animalCount: 4,
        size: 2,
        stables: 0,
      }]
      expect(meetsCardPrerequisites(player, E21_SheepRug, state.round, state)).toBe(true)
    })
  })
})
