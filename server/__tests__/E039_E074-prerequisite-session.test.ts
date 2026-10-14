import { describe, expect, it } from 'vitest'
import type { GameState } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { playMinor, sessionOptions } from './_helpers/batch07-card-play'

// GameSession is the agreed seam: real purchases, rejected requests, then a legal choice.
const setup = (card: string, configure: (state: GameState) => void) => createWorkSession({
  seed: 1159,
  configure: state => {
    state.players.forEach(player => {
      player.minorHand = ['__test_placeholder__']
      player.occupationHand = ['__test_placeholder__']
    })
    state.players[0]!.minorHand = [card, 'B004_WoodPile', 'B007_Wage']
    state.players[0]!.resources.wood = 1
    configure(state)
  },
})

describe('printed animal and planted-field purchase prerequisites', () => {
  it.each([0, 1])('E039 with %i physical pig accepts only the one-pig purchase', pig => {
    const session = setup('E039_Paintbrush', state => {
      const player = state.players[0]!
      player.resources.boar = pig
      if (pig) player.houseAnimals = { '1-0': 'boar' }
    })
    const offered = playMinor(session, 'E039_Paintbrush')
    if (pig) {
      expect(offered.ok, offered.error).toBe(true)
      expect(offered.state.players[0]!.minorPlayed).toContain('E039_Paintbrush')
      expect(offered.state.players[0]!.resources.wood).toBe(0)
    } else {
      expect(offered.state.players[0]!.minorPlayed).not.toContain('E039_Paintbrush')
      expect(sessionOptions(offered).some(option => option.value === 'E039_Paintbrush' && !option.disabled)).toBe(false)
      const before = JSON.stringify({ player: offered.state.players[0], interaction: offered.interaction })
      const bad = session.resolveChoice(0, 'E039_Paintbrush')
      expect(bad.ok).toBe(false)
      expect(JSON.stringify({ player: bad.state.players[0], interaction: bad.interaction })).toBe(before)
      const control = session.resolveChoice(0, 'B004_WoodPile')
      expect(control.ok, JSON.stringify({error:control.error,interaction:control.interaction,played:control.state.players[0]!.minorPlayed})).toBe(true)
      expect(control.state.players[0]!.resources.wood).toBe(1)
    }
    session.dispose()
  })

  it.each([0, 1, 2])('E074 with %i planted ordinary fields requires two distinct fields', count => {
    const session = setup('E074_AshTrees', state => {
      state.players[0]!.fields = [
        { row: 0, col: 1, stacks: count > 0 ? [{ kind: 'grain', remaining: 3 }] : [] },
        { row: 0, col: 2, stacks: count > 1 ? [{ kind: 'vegetable', remaining: 2 }] : [] },
      ]
    })
    const response = playMinor(session, 'E074_AshTrees')
    if (count === 2) {
      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.minorPlayed).toContain('E074_AshTrees')
      expect(response.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences).toBe(5)
    } else {
      expect(response.state.players[0]!.minorPlayed).not.toContain('E074_AshTrees')
      const before = JSON.stringify({ player: response.state.players[0], interaction: response.interaction })
      const rejected = session.resolveChoice(0, 'E074_AshTrees')
      expect(rejected.ok).toBe(false)
      expect(JSON.stringify({ player: rejected.state.players[0], interaction: rejected.interaction })).toBe(before)
      const control = session.resolveChoice(0, 'B004_WoodPile')
      expect(control.ok, JSON.stringify({error:control.error,interaction:control.interaction,played:control.state.players[0]!.minorPlayed})).toBe(true)
      expect(control.state.players[0]!.cardStates.E074_AshTrees?.counters?.fences ?? 0).toBe(0)
    }
    session.dispose()
  })
})
