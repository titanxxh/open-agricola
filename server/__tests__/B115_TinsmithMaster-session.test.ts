import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/actions/effects/animals'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/B/B115_TinsmithMaster'

const CARD_ID = 'B115_TinsmithMaster'

describe('B115_TinsmithMaster session', () => {
  const setupForSow = (options?: {
    withCard?: boolean
    grain?: number
    vegetable?: number
    fields?: { row: number; col: number; stacks: { kind: 'grain' | 'vegetable'; remaining: number }[] }[]
    pastures?: {
      id: string
      size: number
      tiles: { row: number; col: number }[]
      stables: number
      animalType: 'sheep' | 'boar' | 'cattle' | null
      animalCount: number
    }[]
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.phase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = 'grain-utilization'

    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources.food = 10
    player.resources.grain = options?.grain ?? 0
    player.resources.vegetable = options?.vegetable ?? 0
    player.fields = options?.fields ?? []
    player.pastures = options?.pastures ?? []

    if (options?.withCard ?? true) {
      player.occupationPlayed.push(CARD_ID)
    }

    session.loadState(state)
    return session
  }

  // --- Animal capacity tests ---

  describe('pasture capacity', () => {
    it('adds +1 capacity to pastures without stables', () => {
      const session = setupForSow({
        pastures: [
          {
            id: 'p1',
            size: 1,
            tiles: [{ row: 2, col: 2 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      const player = session.getState().state.players[0]!
      const zones = computeAnimalZones(player)
      const pastureZone = zones.find((z) => z.id === 'p1')
      // Size-1 pasture normally has capacity 2, should be 3 with card
      expect(pastureZone?.capacity).toBe(3)
    })

    it('does NOT add capacity to pastures WITH stables', () => {
      const session = setupForSow({
        pastures: [
          {
            id: 'p1',
            size: 1,
            tiles: [{ row: 2, col: 2 }],
            stables: 1,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      // Set stableTiles to match the pasture's stable
      const state = session.getState().state
      state.players[0]!.stableTiles = [{ row: 2, col: 2 }]
      session.loadState(state)

      const player = session.getState().state.players[0]!
      const zones = computeAnimalZones(player)
      const pastureZone = zones.find((z) => z.id === 'p1')
      // Size-1 with 1 stable: 2 * 2^1 = 4, no bonus
      expect(pastureZone?.capacity).toBe(4)
    })

    it('adds +1 to multiple pastures without stables', () => {
      const session = setupForSow({
        pastures: [
          {
            id: 'p1',
            size: 1,
            tiles: [{ row: 2, col: 2 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
          {
            id: 'p2',
            size: 2,
            tiles: [{ row: 2, col: 3 }, { row: 2, col: 4 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      const player = session.getState().state.players[0]!
      const zones = computeAnimalZones(player)
      const p1 = zones.find((z) => z.id === 'p1')
      const p2 = zones.find((z) => z.id === 'p2')
      expect(p1?.capacity).toBe(3) // 2 + 1
      expect(p2?.capacity).toBe(5) // 4 + 1
    })

    it('does NOT add capacity without the card', () => {
      const session = setupForSow({
        withCard: false,
        pastures: [
          {
            id: 'p1',
            size: 1,
            tiles: [{ row: 2, col: 2 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      const player = session.getState().state.players[0]!
      const zones = computeAnimalZones(player)
      const pastureZone = zones.find((z) => z.id === 'p1')
      expect(pastureZone?.capacity).toBe(2) // normal capacity
    })
  })

  // --- Sow bonus tests ---

  describe('sow bonus crop', () => {
    it('auto-adds 1 bonus crop when sowing grain in 1 field', () => {
      const session = setupForSow({
        grain: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)

      // Sow grain in the field
      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      // Continue through any remaining choices
      while (resp.pending.type === 'choice') {
        resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
      }

      // Field should have 4 grain (3 normal + 1 bonus from card)
      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.kind).toBe('grain')
      expect(field?.stacks[0]?.remaining ?? 0).toBe(4)
    })

    it('auto-adds 1 bonus vegetable when sowing vegetable in 1 field', () => {
      const session = setupForSow({
        vegetable: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)

      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: 0, col: 0, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)

      while (resp.pending.type === 'choice') {
        resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
      }

      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.kind).toBe('vegetable')
      expect(field?.stacks[0]?.remaining ?? 0).toBe(3) // 2 normal + 1 bonus
    })

    it('does NOT add bonus crop without the card', () => {
      const session = setupForSow({
        withCard: false,
        grain: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)

      resp = session.commitFarmChoice(0, 'sow', {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      while (resp.pending.type === 'choice') {
        resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
      }

      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.remaining ?? 0).toBe(3) // normal grain sow, no bonus
    })

    it('presents selection when sowing in 2 fields', () => {
      const session = setupForSow({
        grain: 3,
        fields: [
          { row: 0, col: 0, stacks: [] },
          { row: 0, col: 1, stacks: [] },
        ],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(true)

      // Sow grain in both fields
      resp = session.commitFarmChoice(0, 'sow', {
        crops: [
          { row: 0, col: 0, crop: 'grain' },
          { row: 0, col: 1, crop: 'grain' },
        ],
      })
      expect(resp.ok).toBe(true)

      // Should get a selection choice for which field gets the bonus
      if (resp.pending.type === 'choice') {
        // Choose the first field
        resp = session.resolveChoice(0, '0-0')
        expect(resp.ok).toBe(true)
      }

      // Continue through any remaining choices
      while (resp.pending.type === 'choice') {
        resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
      }

      const player = resp.state.players[0]!
      const f0 = player.fields.find((f) => f.row === 0 && f.col === 0)
      const f1 = player.fields.find((f) => f.row === 0 && f.col === 1)
      // One field should have 4 (3+1 bonus), the other 3
      const totalRemaining = (f0?.stacks[0]?.remaining ?? 0 ?? 0) + (f1?.stacks[0]?.remaining ?? 0 ?? 0)
      expect(totalRemaining).toBe(7) // 3 + 3 + 1 bonus = 7
    })
  })
})
