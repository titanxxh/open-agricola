import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../server/game/authoritative-session'
import { createInitialState } from '../shared/session/state-bootstrap'
import { isLegacyChoicePending } from '../server/__tests__/_helpers/legacy-confirms'

describe('GameSession contract', () => {
  let session: GameSession

  beforeEach(() => {
    session = new GameSession()
  })

  describe('getState', () => {
    it('returns initial state with pending none', () => {
      const resp = session.getState()
      expect(resp.ok).toBe(true)
      expect(isLegacyChoicePending(resp)).toBe(false)
      expect(resp.historyLength).toBe(0)
      expect(resp.hasActionStartSnapshot).toBe(false)
      expect(resp.state.round).toBe(1)
      expect(resp.state.players.length).toBe(2)
    })
  })

  describe('getStateForRead', () => {
    it('returns the game state', () => {
      const state = session.getStateForRead()
      expect(state.round).toBe(1)
      expect(state.players.length).toBe(2)
    })
  })

  describe('takeAction', () => {
    it('rejects when not current player', () => {
      const resp = session.takeAction(1, 'some-action')
      expect(resp.ok).toBe(false)
    })

    it('rejects when space does not exist', () => {
      const resp = session.takeAction(0, 'nonexistent-space')
      expect(resp.ok).toBe(false)
    })
  })

  describe('undoStep', () => {
    it('fails when no history', () => {
      const resp = session.undoStep()
      expect(resp.ok).toBe(false)
    })
  })

  describe('undoAction', () => {
    it('fails when no action snapshot', () => {
      const resp = session.undoAction()
      expect(resp.ok).toBe(false)
    })
  })

  describe('devSetResources', () => {
    it('sets player resources', () => {
      const resp = session.devSetResources(0, { wood: 50, clay: 30 })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]?.resources.wood).toBe(50)
      expect(resp.state.players[0]?.resources.clay).toBe(30)
    })

    it('starts animal reorg when dev mode increases animals', () => {
      const resp = session.devSetResources(0, { sheep: 1 })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]?.resources.sheep).toBe(1)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
      expect(resp.interaction.request.kind).toBe('animal-reorg')
      expect(resp.interaction.promptKey).toBe('ui.interactionAnimalReorg')
    })

    it('finishes dev animal reorg without advancing to the next player', () => {
      session.devSetResources(0, { sheep: 1 })
      const resp = session.resolveChoice(0, 'confirm', {
        zones: [
          { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
        ],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.currentPlayerIndex).toBe(0)
      expect(resp.interaction.stateId).toBe('idle')
      expect(resp.state.players[0]?.houseAnimalType).toBe('sheep')
      expect(resp.state.players[0]?.houseAnimalCount).toBe(1)
    })

    it('rejects invalid player index', () => {
      const resp = session.devSetResources(99, { wood: 10 })
      expect(resp.ok).toBe(false)
    })
  })

  describe('devSetRound', () => {
    it('sets the game round', () => {
      const resp = session.devSetRound(5)
      expect(resp.ok).toBe(true)
      expect(resp.state.round).toBe(5)
    })
  })

  describe('devSetCurrentPlayer', () => {
    it('changes the current player', () => {
      const resp = session.devSetCurrentPlayer(1)
      expect(resp.ok).toBe(true)
      expect(resp.state.currentPlayerIndex).toBe(1)
    })

    it('rejects out-of-range index', () => {
      const resp = session.devSetCurrentPlayer(10)
      expect(resp.ok).toBe(false)
    })
  })

  describe('devPlayCard', () => {
    it('adds a card to minorPlayed', () => {
      const resp = session.devPlayCard(0, 'TestCard')
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]?.minorPlayed).toContain('TestCard')
    })
  })

  describe('devSetSpaceTaken', () => {
    it('marks a space as taken', () => {
      const state = session.getStateForRead()
      const space = state.actionSpaces[0]
      if (!space) return

      const resp = session.devSetSpaceTaken(space.id, 'p1')
      expect(resp.ok).toBe(true)
      const updated = resp.state.actionSpaces.find((s) => s.id === space.id)
      expect(updated?.takenBy[0]?.playerId).toBe('p1')
    })

    it('rejects nonexistent space', () => {
      const resp = session.devSetSpaceTaken('nonexistent', 'p1')
      expect(resp.ok).toBe(false)
    })
  })

  describe('loadState', () => {
    it('loads an external state', () => {
      const custom = createInitialState(123)
      custom.round = 7
      const resp = session.loadState(custom)
      expect(resp.ok).toBe(true)
      expect(resp.state.round).toBe(7)
      expect(isLegacyChoicePending(resp)).toBe(false)
    })
  })

  describe('SessionResponse shape', () => {
    it('includes all expected fields', () => {
      const resp = session.getState()
      expect(resp).toHaveProperty('ok')
      expect(resp).toHaveProperty('state')
      expect(resp).toHaveProperty('interaction')
      expect(resp).toHaveProperty('historyLength')
      expect(resp).toHaveProperty('hasActionStartSnapshot')
    })

    it('includes scores when game is over', () => {
      const state = createInitialState(42)
      state.gameOver = true
      const overSession = new GameSession(state)
      const resp = overSession.getState()
      expect(resp.scores).toBeDefined()
      expect(Array.isArray(resp.scores)).toBe(true)
    })
  })
})
