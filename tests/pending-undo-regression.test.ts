import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../server/game-session'
import { createInitialState } from '../shared/logic/state'
import { getAllTilePositions } from '../shared/game/farm'
import type { PendingAction } from '../shared/game/types'

describe('pending choice types + undo regression', () => {
  let session: GameSession

  function findAvailableAction(session: GameSession, predicate?: (a: { spaceId: string; nameKey: string }) => boolean) {
    const actions = session.getAvailableActions(0)
    return predicate ? actions.find(predicate) : actions[0]
  }

  function hasAvailableAction(session: GameSession, spaceId: string) {
    return session.getAvailableActions(0).some((action) => action.spaceId === spaceId)
  }

  function openRoundAction(actionId: string) {
    return [actionId, ...Array.from({ length: 13 }, () => null)]
  }

  describe('flow-derived action availability', () => {
    it('grain-utilization is available when only sow child is doable', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('grain-utilization')
      player.resources.grain = 1
      player.fields = [{ row: 0, col: 3, crop: null, remaining: 0 }]

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'grain-utilization')).toBe(true)
    })

    it('grain-utilization is available when only bake-bread child is doable', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('grain-utilization')
      player.resources.grain = 1
      player.improvements.push('Major_Fireplace1')

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'grain-utilization')).toBe(true)
    })

    it('grain-utilization is not available when no child is doable', () => {
      const state = createInitialState(42)
      state.roundActionOrder = openRoundAction('grain-utilization')
      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'grain-utilization')).toBe(false)
    })

    it('cultivation is available when only plow child is doable', () => {
      const state = createInitialState(42)
      state.round = 5
      state.roundActionOrder = openRoundAction('cultivation')

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'cultivation')).toBe(true)
    })

    it('cultivation is available when only sow child is doable', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.round = 5
      state.roundActionOrder = openRoundAction('cultivation')
      player.resources.grain = 1
      player.fields = getAllTilePositions().map((position, index) => ({
        row: position.row,
        col: position.col,
        crop: index === 0 ? null : 'grain',
        remaining: index === 0 ? 0 : 1,
      }))
      player.roomTiles = []
      player.stableTiles = []
      player.pastures = []

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'cultivation')).toBe(true)
    })

    it('farm-expansion is available when only construct child is doable', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      player.resources.wood = 5
      player.resources.reed = 2
      player.stableTiles = getAllTilePositions().slice(0, 4)

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'farm-expansion')).toBe(true)
    })

    it('farm-expansion is available when only stables child is doable', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      player.resources.wood = 2

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'farm-expansion')).toBe(true)
    })

    it('major-improvement is available when child isDoable hook makes improvement-any doable', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('major-improvement')
      state.availableMajorImprovements = []
      player.minorHand = []

      const session = new GameSession(state)
      session.devPlayCard(0, 'B75_WoodWorkshop')

      expect(hasAvailableAction(session, 'major-improvement')).toBe(true)
    })

    it('house-redevelopment is available when mandatory renovate child is doable and optional improvement is not', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('house-redevelopment')
      player.resources.clay = player.rooms
      player.resources.reed = player.rooms
      player.minorHand = []
      state.availableMajorImprovements = []

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'house-redevelopment')).toBe(true)
    })

    it('wish-children is available when growth child is doable and optional minor-improvement is not', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('wish-children')
      player.rooms = 3
      player.familySize = 2
      player.minorHand = []

      const session = new GameSession(state)
      expect(hasAvailableAction(session, 'wish-children')).toBe(true)
    })

    it('child isDoable hook can make grain-utilization available', () => {
      const state = createInitialState(42)
      state.roundActionOrder = openRoundAction('grain-utilization')
      const session = new GameSession(state)
      session.devPlayCard(0, 'A94_LazySowman')

      expect(hasAvailableAction(session, 'grain-utilization')).toBe(true)
    })
  })

  describe('pending type: none', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('initial state has pending none', () => {
      const resp = session.getState()
      expect(resp.pending.type).toBe('none')
      expect(resp.ok).toBe(true)
    })
  })

  describe('pending type: confirmNextPlayer', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('simple gain action leads to confirmNextPlayer', () => {
      const dayLaborer = findAvailableAction(session, (a) => a.spaceId === 'day-laborer')
      if (!dayLaborer) return

      const resp = session.takeAction(0, dayLaborer.spaceId)
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('confirmNextPlayer')
      if (resp.pending.type === 'confirmNextPlayer') {
        expect(resp.pending.nextPlayerIndex).toBe(1)
      }
    })

    it('confirming transitions to next player', () => {
      const dayLaborer = findAvailableAction(session, (a) => a.spaceId === 'day-laborer')
      if (!dayLaborer) return

      session.takeAction(0, dayLaborer.spaceId)
      const resp = session.confirmNextPlayer()
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('none')
      expect(resp.state.currentPlayerIndex).toBe(1)
    })
  })

  describe('pending type: choice', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('farmland action leads to plow choice', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const resp = session.takeAction(0, farmland.spaceId)
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
      if (resp.pending.type === 'choice') {
        expect(resp.pending.playerIndex).toBe(0)
        expect(resp.pending.promptKey).toBe('ui.interactionPlowSelect')
        expect(resp.pending.options.length).toBeGreaterThan(0)
      }
    })

    it('cancel resolves the choice', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      session.takeAction(0, farmland.spaceId)
      const state = session.getState()
      if (state.pending.type !== 'choice') return

      const resp = session.resolveChoice(0, 'cancel')
      expect(resp.ok).toBe(true)
    })

    it('farm-expansion offers or-choice', () => {
      session.devSetResources(0, { wood: 20, clay: 20, reed: 20 })
      const farmExpansion = findAvailableAction(session, (a) => a.spaceId === 'farm-expansion')
      if (!farmExpansion) return

      const resp = session.takeAction(0, farmExpansion.spaceId)
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
    })
  })

  describe('pending type: animalReorg', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('sheep-market triggers animalReorg when animals gained', () => {
      const state = session.getStateForRead()
      const sheepSpace = state.actionSpaces.find((s) => s.id === 'sheep-market')
      if (!sheepSpace || sheepSpace.resources.sheep === 0) return

      const openRound = sheepSpace.roundAvailable
      if (state.round < openRound) return

      const resp = session.takeAction(0, 'sheep-market')
      if (!resp.ok) return

      expect(resp.pending.type).toBe('animalReorg')
      if (resp.pending.type === 'animalReorg') {
        expect(resp.pending.playerIndex).toBe(0)
      }
    })

    it('confirmAnimalReorg resolves the pending', () => {
      const state = session.getStateForRead()
      const sheepSpace = state.actionSpaces.find((s) => s.id === 'sheep-market')
      if (!sheepSpace || sheepSpace.resources.sheep === 0) return

      const openRound = sheepSpace.roundAvailable
      if (state.round < openRound) return

      const takeResp = session.takeAction(0, 'sheep-market')
      if (!takeResp.ok || takeResp.pending.type !== 'animalReorg') return

      const resp = session.confirmAnimalReorg(0, [
        { id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 },
      ])
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('confirmNextPlayer')
    })
  })

  describe('undo', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('undoStep after takeAction restores state', () => {
      const dayLaborer = findAvailableAction(session, (a) => a.spaceId === 'day-laborer')
      if (!dayLaborer) return

      const before = session.getState()
      const beforeFood = before.state.players[0]!.resources.food

      session.takeAction(0, dayLaborer.spaceId)
      const afterAction = session.getState()
      expect(afterAction.state.players[0]!.resources.food).toBeGreaterThan(beforeFood)

      const undone = session.undoStep()
      expect(undone.ok).toBe(true)
      expect(undone.pending.type).toBe('none')
    })

    it('undoAction after multi-step resolves to action start', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const before = session.getState()
      const beforeWorkers = before.state.players[0]!.workersAvailable

      session.takeAction(0, farmland.spaceId)
      const afterTake = session.getState()
      expect(afterTake.pending.type).toBe('choice')
      expect(afterTake.hasActionStartSnapshot).toBe(true)

      const undone = session.undoAction()
      expect(undone.ok).toBe(true)
      expect(undone.state.players[0]!.workersAvailable).toBe(beforeWorkers)
      expect(undone.pending.type).toBe('none')
    })

    it('undoStep fails when no history', () => {
      const resp = session.undoStep()
      expect(resp.ok).toBe(false)
    })

    it('undoAction fails when no action snapshot', () => {
      const resp = session.undoAction()
      expect(resp.ok).toBe(false)
    })

    it('multiple undoSteps work sequentially', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      session.takeAction(0, farmland.spaceId)
      const state1 = session.getState()
      if (state1.pending.type !== 'choice') return

      const undo1 = session.undoStep()
      expect(undo1.ok).toBe(true)

      const undo2 = session.undoStep()
      expect(undo2.ok).toBe(false)
    })
  })

  describe('pending → undo → re-take cycle', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('can undo and retake a different action', () => {
      const actions = session.getAvailableActions(0)
      if (actions.length < 2) return

      const first = actions[0]!
      session.takeAction(0, first.spaceId)
      const afterFirst = session.getState()
      const firstPending = afterFirst.pending.type

      session.undoAction()
      const afterUndo = session.getState()
      expect(afterUndo.pending.type).toBe('none')

      const second = actions[1]!
      const retake = session.takeAction(0, second.spaceId)
      expect(retake.ok).toBe(true)
      expect(retake.state.actionSpaces.find((s) => s.id === first.spaceId)?.takenBy).toBeNull()
      expect(retake.state.actionSpaces.find((s) => s.id === second.spaceId)?.takenBy).toBeTruthy()
    })
  })

  describe('commitFarmChoice with undo', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('commitFarmChoice for plow then undo restores field count', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const takeResp = session.takeAction(0, farmland.spaceId)
      if (takeResp.pending.type !== 'choice') return

      const fieldsBefore = takeResp.state.players[0]!.fields.length

      const commit = session.commitFarmChoice(0, 'plow', {
        tile: { row: 0, col: 3 },
      })
      if (!commit.ok) return
      expect(commit.state.players[0]!.fields.length).toBe(fieldsBefore + 1)

      const undone = session.undoStep()
      expect(undone.ok).toBe(true)
      expect(undone.state.players[0]!.fields.length).toBe(fieldsBefore)
    })

    it('commitFarmChoice rejects when no pending choice', () => {
      const resp = session.commitFarmChoice(0, 'plow', { tile: { row: 0, col: 3 } })
      expect(resp.ok).toBe(false)
    })
  })

  describe('SessionResponse shape consistency', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('all responses include required fields', () => {
      const responses: ReturnType<GameSession['getState']>[] = []

      responses.push(session.getState())

      const action = findAvailableAction(session)
      if (action) {
        responses.push(session.takeAction(0, action.spaceId))
      }

      for (const resp of responses) {
        expect(resp).toHaveProperty('ok')
        expect(resp).toHaveProperty('state')
        expect(resp).toHaveProperty('pending')
        expect(resp).toHaveProperty('historyLength')
        expect(resp).toHaveProperty('hasActionStartSnapshot')
        expect(resp.state).toHaveProperty('round')
        expect(resp.state).toHaveProperty('players')
        expect(resp.state).toHaveProperty('actionSpaces')
      }
    })

    it('pending type is always one of the known variants', () => {
      const validTypes = ['none', 'choice', 'animalReorg', 'harvestFeed', 'confirmNextPlayer']
      const resp = session.getState()
      expect(validTypes).toContain(resp.pending.type)

      const action = findAvailableAction(session)
      if (action) {
        const actionResp = session.takeAction(0, action.spaceId)
        expect(validTypes).toContain(actionResp.pending.type)
      }
    })
  })
})
