import { describe, expect, it, beforeEach } from 'vitest'
import { GameSession } from '../server/game/authoritative-session'
import { createInitialState } from '../shared/session/state-bootstrap'
import { getAllTilePositions } from '../shared/domain/farm'
import { confirmNextPlayer } from '../server/__tests__/_helpers/pending-confirms'

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
      player.fields = [{ row: 0, col: 3, stacks: [] }]

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
        stacks: index === 0 ? [] : [{ kind: 'grain' as const, remaining: 1 }],
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

    it('major-improvement is available when Wood Workshop can start before reachability', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('major-improvement')
      state.availableMajorImprovements = []
      player.minorHand = ['C060_SmallPottersOven']

      const session = new GameSession(state)
      session.devPlayCard(0, 'B075_WoodWorkshop')

      expect(hasAvailableAction(session, 'major-improvement')).toBe(true)
    })

    it('major-improvement is available when Wood Workshop gain unlocks an improvement', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('major-improvement')
      state.availableMajorImprovements = []
      player.minorHand = ['A007_GardenersKnife']
      player.resources.wood = 0

      const session = new GameSession(state)
      session.devPlayCard(0, 'B075_WoodWorkshop')

      expect(hasAvailableAction(session, 'major-improvement')).toBe(true)
    })

    it('house-redevelopment is available when mandatory renovate child is doable and optional improvement is not', () => {
      const state = createInitialState(42)
      const player = state.players[0]!
      state.roundActionOrder = openRoundAction('house-redevelopment')
      player.resources.clay = player.rooms
      player.resources.reed = 1
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
      session.devPlayCard(0, 'A094_LazySowman')

      expect(hasAvailableAction(session, 'grain-utilization')).toBe(true)
    })

    it('before-sow resource provider can make grain-utilization available', () => {
      const state = createInitialState(42)
      state.roundActionOrder = openRoundAction('grain-utilization')
      state.players[0]!.fields.push({
        row: 0,
        col: 0,
        stacks: [],
      } as any)
      state.players[0]!.resources.grain = 0
      state.players[0]!.resources.vegetable = 0
      const session = new GameSession(state)
      session.devPlayCard(0, 'A065_SeedPellets')

      expect(hasAvailableAction(session, 'grain-utilization')).toBe(true)
    })

    it('Seed Pellets grants grain before grain-utilization sow resolves', () => {
      const state = createInitialState(42)
      state.roundActionOrder = openRoundAction('grain-utilization')
      state.players[0]!.fields = [{ row: 0, col: 0, stacks: [] }]
      state.players[0]!.resources.grain = 0
      state.players[0]!.resources.vegetable = 0
      const session = new GameSession(state)
      session.devPlayCard(0, 'A065_SeedPellets')

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
        .toBe('ui.interactionSowSelect')
      expect(resp.state.players[0]!.resources.grain).toBe(1)
      expect(resp.interaction.stateId).toBe('wait')
      expect(
        resp.interaction.stateId === 'wait' && resp.interaction.request.farm.farmType === 'sow'
          ? resp.interaction.request.farm.selectableFields
          : [],
      ).toContainEqual({
        tile: { row: 0, col: 0 },
        allowedCrops: ['grain'],
      })

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.grain).toBe(0)
      expect(resp.state.players[0]!.fields).toContainEqual({
        row: 0,
        col: 0,
        stacks: [{ kind: 'grain', remaining: 3 }],
      })
    })
  })

  describe('pending type: none', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('initial state has pending none', () => {
      const resp = session.getState()
      expect(resp.interaction.stateId).toBe('idle')
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
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
      if (resp.interaction.stateId === 'wait' && resp.interaction.request.kind === 'confirm-next-player') {
        expect(resp.interaction.request.nextPlayerIndex).toBe(1)
      }
    })

    it('confirming transitions to next player', () => {
      const dayLaborer = findAvailableAction(session, (a) => a.spaceId === 'day-laborer')
      if (!dayLaborer) return

      session.takeAction(0, dayLaborer.spaceId)
      const resp = confirmNextPlayer(session)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('idle')
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
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId === 'wait') {
        expect(resp.interaction.playerIndex).toBe(0)
        expect(resp.interaction.promptKey).toBe('ui.interactionPlowSelect')
        expect(resp.interaction.request.options?.length).toBeGreaterThan(0)
      }
    })

    it('cancel is rejected for protected farm choice', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      session.takeAction(0, farmland.spaceId)
      const state = session.getState()
      if (state.interaction.stateId !== 'wait') return

      const resp = session.commitSelectionChoice(0, { cancel: true })
      expect(resp.ok).toBe(false)
      expect(resp.interaction.stateId).toBe('wait')
    })

    it('farm-expansion offers or-choice', () => {
      session.devSetResources(0, { wood: 20, clay: 20, reed: 20 })
      const farmExpansion = findAvailableAction(session, (a) => a.spaceId === 'farm-expansion')
      if (!farmExpansion) return

      const resp = session.takeAction(0, farmExpansion.spaceId)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
    })
  })

  describe('interaction + anytime actions', () => {
    beforeEach(() => {
      const state = createInitialState(42)
      const player = state.players[0]!
      player.resources.grain = 1
      player.improvements.push('Major_Fireplace1')
      session = new GameSession(state)
    })

    it('farmland does not expose bake-bread as anytime during plow selection', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const resp = session.takeAction(0, farmland.spaceId)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return

      expect(resp.interaction.request.farm.farmType).toBe('plow')
      // bake-bread is NOT an anytime action — only exchange-type actions are
      expect(resp.interaction.anytimeActions.some((action) => action.id === 'bake-bread')).toBe(false)
    })

    it('rejects ordinary takeAction while an interaction is in progress', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const takeResp = session.takeAction(0, farmland.spaceId)
      if (!takeResp.ok) return

      const rejectResp = session.takeAction(0, 'day-laborer')
      expect(rejectResp.ok).toBe(false)
      expect(rejectResp.error).toBe('interaction in progress')
    })
  })

  describe('pending type: choice with promptKey ui.interactionAnimalReorg', () => {
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

      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId === 'wait' && resp.interaction.promptKey === 'ui.interactionAnimalReorg') {
        expect(resp.interaction.playerIndex).toBe(0)
      }
    })

    it('confirmAnimalReorg resolves the pending', () => {
      const state = session.getStateForRead()
      const sheepSpace = state.actionSpaces.find((s) => s.id === 'sheep-market')
      if (!sheepSpace || sheepSpace.resources.sheep === 0) return

      const openRound = sheepSpace.roundAvailable
      if (state.round < openRound) return

      const takeResp = session.takeAction(0, 'sheep-market')
      if (!takeResp.ok || takeResp.interaction.stateId !== 'wait' || takeResp.interaction.promptKey !== 'ui.interactionAnimalReorg') return

      const zones = [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: 1 }]
      const resp = session.resolveChoice(0, 'confirm', zones as unknown as Record<string, unknown>)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.request.kind : resp.interaction.stateId).toBe('confirm-next-player')
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
      expect(undone.interaction.stateId).toBe('idle')
    })

    it('undoAction after multi-step resolves to action start', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const before = session.getState()
      const beforeWorkers = before.state.players[0]!.workersAvailable

      session.takeAction(0, farmland.spaceId)
      const afterTake = session.getState()
      expect(afterTake.interaction.stateId).toBe('wait')
      expect(afterTake.hasActionStartSnapshot).toBe(true)

      const undone = session.undoAction()
      expect(undone.ok).toBe(true)
      expect(undone.state.players[0]!.workersAvailable).toBe(beforeWorkers)
      expect(undone.interaction.stateId).toBe('idle')
    })

    it('undoStep fails when no history', () => {
      const resp = session.undoStep()
      expect(resp.ok).toBe(false)
    })

    it('undoAction fails when no action snapshot', () => {
      const resp = session.undoAction()
      expect(resp.ok).toBe(false)
    })

    it('undoStep on direct farm selection restores action start', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      session.takeAction(0, farmland.spaceId)
      const state1 = session.getState()
      if (state1.interaction.stateId !== 'wait') return

      const undo1 = session.undoStep()
      expect(undo1.ok).toBe(true)
      expect(undo1.interaction.stateId).toBe('idle')
      expect(
        undo1.state.actionSpaces.find((space) => space.id === farmland.spaceId)?.takenBy[0]?.playerId,
      ).toBeUndefined()
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
      session.undoAction()
      const afterUndo = session.getState()
      expect(afterUndo.interaction.stateId).toBe('idle')

      const second = actions[1]!
      const retake = session.takeAction(0, second.spaceId)
      expect(retake.ok).toBe(true)
      expect(retake.state.actionSpaces.find((s) => s.id === first.spaceId)?.takenBy).toEqual([])
      expect((retake.state.actionSpaces.find((s) => s.id === second.spaceId)?.takenBy.length ?? 0) > 0).toBe(true)
    })
  })

  describe('commitSelectionChoice with undo', () => {
    beforeEach(() => {
      session = new GameSession(createInitialState(42))
    })

    it('commitSelectionChoice for plow then undo restores field count', () => {
      const farmland = findAvailableAction(session, (a) => a.spaceId === 'farmland')
      if (!farmland) return

      const takeResp = session.takeAction(0, farmland.spaceId)
      if (takeResp.interaction.stateId !== 'wait') return

      const fieldsBefore = takeResp.state.players[0]!.fields.length

      const commit = session.commitSelectionChoice(0, {
        tile: { row: 0, col: 3 },
      })
      if (!commit.ok) return
      expect(commit.state.players[0]!.fields.length).toBe(fieldsBefore + 1)

      const undone = session.undoStep()
      expect(undone.ok).toBe(true)
      expect(undone.state.players[0]!.fields.length).toBe(fieldsBefore)
    })

    it('resolveChoice rejects when no pending choice', () => {
      const resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 3 } })
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
        expect(resp).toHaveProperty('interaction')
        expect(resp).toHaveProperty('historyLength')
        expect(resp).toHaveProperty('hasActionStartSnapshot')
        expect(resp.state).toHaveProperty('round')
        expect(resp.state).toHaveProperty('players')
        expect(resp.state).toHaveProperty('actionSpaces')
      }
    })

    it('interaction stateId is always one of the known variants', () => {
      const validStates = ['idle', 'wait', 'gameover']
      const resp = session.getState()
      expect(validStates).toContain(resp.interaction.stateId)

      const action = findAvailableAction(session)
      if (action) {
        const actionResp = session.takeAction(0, action.spaceId)
        expect(validStates).toContain(actionResp.interaction.stateId)
      }
    })
  })
})
