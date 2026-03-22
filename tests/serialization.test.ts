import { describe, expect, it } from 'vitest'
import { serializeState, rehydrateState, type SerializedGameState } from '../shared/game/serialization'
import { createInitialState } from '../shared/logic/state'
import { getCardModifiers } from '../shared/cards/card-modifiers'
import { GameSession } from '../server/game-session'

describe('shared/game/serialization', () => {
  const state = createInitialState(42)

  describe('serializeState', () => {
    it('strips function fields from action spaces', () => {
      const serialized = serializeState(state)
      for (const space of serialized.actionSpaces) {
        const record = space as Record<string, unknown>
        expect(record.canBeExecutedByPlayer).toBeUndefined()
        expect(record.execute).toBeUndefined()
        expect(record.resolveChoice).toBeUndefined()
        expect(record.flow).toBeUndefined()
      }
    })

    it('preserves non-function fields on action spaces', () => {
      const serialized = serializeState(state)
      for (const space of serialized.actionSpaces) {
        expect(space.id).toBeDefined()
        expect(space.nameKey).toBeDefined()
        expect(space.resources).toBeDefined()
        expect(space.takenBy).toBeNull()
      }
    })

    it('sets roundStartSnapshot to null', () => {
      const stateWithSnapshot = { ...state, roundStartSnapshot: state }
      const serialized = serializeState(stateWithSnapshot)
      expect(serialized.roundStartSnapshot).toBeNull()
    })

    it('preserves game data fields', () => {
      const serialized = serializeState(state)
      expect(serialized.round).toBe(state.round)
      expect(serialized.currentPlayerIndex).toBe(state.currentPlayerIndex)
      expect(serialized.players).toEqual(state.players)
      expect(serialized.gameSeed).toBe(state.gameSeed)
      expect(serialized.gameOver).toBe(state.gameOver)
    })

    it('produces JSON-safe output', () => {
      const serialized = serializeState(state)
      const json = JSON.stringify(serialized)
      const parsed = JSON.parse(json)
      expect(parsed.actionSpaces.length).toBe(serialized.actionSpaces.length)
    })
  })

  describe('rehydrateState', () => {
    it('restores function fields on action spaces', () => {
      const serialized = serializeState(state)
      const restored = rehydrateState(serialized)
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
        space.takenBy = 'p1'
      }
      const serialized = serializeState(modified)
      const restored = rehydrateState(serialized)
      if (space) {
        const restoredSpace = restored.actionSpaces.find((s) => s.id === space.id)
        expect(restoredSpace?.resources.wood).toBe(99)
        expect(restoredSpace?.takenBy).toBe('p1')
      }
    })

    it('round-trips correctly', () => {
      const serialized = serializeState(state)
      const restored = rehydrateState(serialized)
      expect(restored.round).toBe(state.round)
      expect(restored.players.length).toBe(state.players.length)
      expect(restored.actionSpaces.length).toBeGreaterThan(0)
    })

    it('rebuilds missing activeModifiers from played cards', () => {
      const modified = createInitialState(42)
      const player = modified.players[0]!
      player.minorPlayed.push('A14_CarpentersHammer')
      player.playedCards.push('minor:A14_CarpentersHammer')
      player.activeModifiers = []

      const serialized = serializeState(modified)
      serialized.players[0]!.activeModifiers = []

      const restored = rehydrateState(serialized)
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
      player.playedCards.push('minor:A14_CarpentersHammer')
      player.activeModifiers = []

      const serialized = serializeState(modified)
      serialized.players[0]!.activeModifiers = []

      const session = new GameSession()
      session.loadState(serialized)

      let resp = session.takeAction(0, 'farm-expansion')
      expect(resp.ok).toBe(true)
      expect(resp.pending.type).toBe('choice')
      if (resp.pending.type !== 'choice') return

      const constructOption = resp.pending.options.find(
        (option) => option.labelKey === 'actions.construct.name',
      )
      expect(constructOption).toBeDefined()

      resp = session.resolveChoice(0, constructOption!.value)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('farmSelect')
      if (resp.interaction.stateId !== 'farmSelect') return
      expect(resp.interaction.farm.farmType).toBe('room')
      if (resp.interaction.farm.farmType !== 'room') return
      expect(resp.interaction.farm.maxSelections).toBe(2)
    })
  })
})
