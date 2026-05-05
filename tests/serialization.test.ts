import { describe, expect, it } from 'vitest'
import { serializeState, rehydrateState } from '../shared/game/serialization'
import { createInitialState } from '../shared/logic/state'
import { getCardModifiers } from '../shared/cards/card-modifiers'
import { GameSession } from '../server/game/authoritative-session'
import { EngineStack } from '../shared/engine'

const emptyCtx = () => ({ engineStack: new EngineStack() })

describe('shared/game/serialization', () => {
  const state = createInitialState(42)

  describe('serializeState', () => {
    it('strips function fields from action spaces', () => {
      const serialized = serializeState(state, emptyCtx())
      for (const space of serialized.actionSpaces) {
        const record = space as Record<string, unknown>
        expect(record.canBeExecutedByPlayer).toBeUndefined()
        expect(record.execute).toBeUndefined()
        expect(record.resolveChoice).toBeUndefined()
        expect(record.flow).toBeUndefined()
      }
    })

    it('preserves non-function fields on action spaces', () => {
      const serialized = serializeState(state, emptyCtx())
      for (const space of serialized.actionSpaces) {
        expect(space.id).toBeDefined()
        expect(space.nameKey).toBeDefined()
        expect(space.resources).toBeDefined()
        expect(space.takenBy).toEqual([])
      }
    })

    it('sets roundStartSnapshot to null', () => {
      const stateWithSnapshot = { ...state, roundStartSnapshot: state }
      const serialized = serializeState(stateWithSnapshot, emptyCtx())
      expect(serialized.roundStartSnapshot).toBeNull()
    })

    it('preserves game data fields', () => {
      const serialized = serializeState(state, emptyCtx())
      expect(serialized.round).toBe(state.round)
      expect(serialized.currentPlayerIndex).toBe(state.currentPlayerIndex)
      expect(serialized.players).toEqual(state.players)
      expect(serialized.gameSeed).toBe(state.gameSeed)
      expect(serialized.gameOver).toBe(state.gameOver)
    })

    it('produces JSON-safe output', () => {
      const serialized = serializeState(state, emptyCtx())
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      expect(parsed.actionSpaces.length).toBe(serialized.actionSpaces.length)
    })
  })

  describe('rehydrateState', () => {
    it('restores function fields on action spaces', () => {
      const serialized = serializeState(state, emptyCtx())
      const { state: restored } = rehydrateState(serialized)
      for (const space of restored.actionSpaces) {
        expect(typeof space.canBeExecutedByPlayer).toBe('function')
        expect(typeof space.execute).toBe('function')
      }
    })

    it('preserves resources and takenBy from serialized data', () => {
      const modified = { ...state }
      const space = modified.actionSpaces.find((s) => s.gainPerRound.wood)
      if (space) {
        space.resources.wood = 99
        space.takenBy = [{ playerId: 'p1', workerId: '1' }]
      }
      const serialized = serializeState(modified, emptyCtx())
      const { state: restored } = rehydrateState(serialized)
      if (space) {
        const restoredSpace = restored.actionSpaces.find((s) => s.id === space.id)
        expect(restoredSpace?.resources.wood).toBe(99)
        expect(restoredSpace?.takenBy).toEqual([{ playerId: 'p1', workerId: '1' }])
      }
    })

    it('round-trips correctly', () => {
      const serialized = serializeState(state, emptyCtx())
      const { state: restored } = rehydrateState(serialized)
      expect(restored.round).toBe(state.round)
      expect(restored.players.length).toBe(state.players.length)
      expect(restored.actionSpaces.length).toBeGreaterThan(0)
    })

    it('keeps player-count action spaces filtered after round-trip', () => {
      for (const playerCount of [2, 3, 4] as const) {
        const original = createInitialState(42, { playerCount })
        const serialized = serializeState(original, emptyCtx())
        const { state: restored } = rehydrateState(serialized)
        const originalIds = original.actionSpaces.map((space) => space.id).sort()
        const restoredIds = restored.actionSpaces.map((space) => space.id).sort()
        expect(restoredIds).toEqual(originalIds)
      }
    })

    it('rebuilds missing activeModifiers from played cards', () => {
      const modified = createInitialState(42)
      const player = modified.players[0]!
      player.minorPlayed.push('A14_CarpentersHammer')
      player.activeModifiers = []

      const serialized = serializeState(modified, emptyCtx())
      serialized.players[0]!.activeModifiers = []

      const { state: restored } = rehydrateState(serialized)
      expect(getCardModifiers('A14_CarpentersHammer')).not.toHaveLength(0)
      expect(restored.players[0]!.activeModifiers).toEqual(
        getCardModifiers('A14_CarpentersHammer'),
      )
    })

    it('loadState also rebuilds missing activeModifiers for room expansion limits', () => {
      const modified = createInitialState(42)
      const player = modified.players[0]!
      player.resources = {
        ...player.resources,
        wood: 8,
        reed: 2,
      }
      player.minorPlayed.push('A14_CarpentersHammer')
      player.activeModifiers = []

      const serialized = serializeState(modified, emptyCtx())
      serialized.players[0]!.activeModifiers = []

      const session = new GameSession()
      session.loadState(serialized)

      let resp = session.takeAction(0, 'farm-expansion')
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return

      const constructOption = resp.interaction.options?.find(
        (option) => option.labelKey === 'actions.construct.name',
      )
      expect(constructOption).toBeDefined()

      resp = session.resolveChoice(0, constructOption!.value)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') return
      const farm = resp.interaction.farm
      expect(farm).toBeDefined()
      if (!farm) return
      expect(farm.farmType).toBe('room')
      if (farm.farmType !== 'room') return
      expect(farm.maxSelections).toBe(2)
    })
  })
})
