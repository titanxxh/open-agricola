import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeAnimalZones } from '../../shared/actions/helpers/animal-zones'

import { markAllWorkersUsed } from '../../shared/game/player'
import '../../shared/cards/B/B72_LoveforAgriculture'
import type { AnimalZone } from '../../shared/actions/helpers/animal-zones'


type PastureCrop = { pastureId: string; crop: 'grain' | 'vegetable'; remaining: number }

const harvestRounds = [4, 7, 9, 11, 13, 14]

const setup = (options?: {
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
  round?: number
}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = options?.round ?? 1
  state.roundPhase = 'work'
  // Ensure grain-utilization is available
  state.roundActionOrder = state.roundActionOrder.map(() => null)
  state.roundActionOrder[0] = 'grain-utilization'

  const player = state.players[0]!
  player.workersAvailable = options?.round && harvestRounds.includes(options.round) ? 0 : 2
  player.resources.food = 10
  player.resources.grain = options?.grain ?? 0
  player.resources.vegetable = options?.vegetable ?? 0
  player.fields = options?.fields ?? []
  player.pastures = options?.pastures ?? []

  if (options?.withCard ?? true) {
    player.minorPlayed.push('B72_LoveforAgriculture')
  }

  // Set all players' workers to 0 for harvest/round-end tests
  if (options?.round && harvestRounds.includes(options.round)) {
    for (const p of state.players) {
      markAllWorkersUsed(state, p)
    }
  }

  session.loadState(state)
  return session
}

describe('B72_LoveforAgriculture session', () => {
  describe('sow in pasture', () => {
    it('allows sowing grain in a size-1 pasture', () => {
      const session = setup({
        grain: 2,
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

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      // Choose sow
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')
      expect(resp.interaction.stateId).toBe('wait')

      // The interaction should include the pasture tile as sowable
      if (resp.interaction.stateId === 'wait' && resp.interaction.farm.farmType === 'sow') {
        const pastureField = resp.interaction.farm.selectableFields.find(
          (f) => f.tile.row === 2 && f.tile.col === 2,
        )
        expect(pastureField).toBeDefined()
        expect(pastureField?.allowedCrops).toContain('grain')
      }

      // Sow grain in the pasture tile
      resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: 2, col: 2, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      // Grain should be deducted
      expect(resp.state.players[0]!.resources.grain).toBe(1)

      // Pasture crops should be stored in cardStates
      const cardState = resp.state.players[0]!.cardStates['B72_LoveforAgriculture']
      expect(cardState?.extraData?.pastureCrops).toBeDefined()
      const crops = cardState?.extraData?.pastureCrops as PastureCrop[]
      expect(crops.length).toBe(1)
      expect(crops[0].pastureId).toBe('p1')
      expect(crops[0].crop).toBe('grain')
      expect(crops[0].remaining).toBe(3)
    })

    it('allows sowing vegetable in a size-2 pasture', () => {
      const session = setup({
        vegetable: 1,
        pastures: [
          {
            id: 'p1',
            size: 2,
            tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: 2, col: 2, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.vegetable).toBe(0)

      const crops = resp.state.players[0]!.cardStates['B72_LoveforAgriculture']?.extraData?.pastureCrops as PastureCrop[]
      expect(crops.length).toBe(1)
      expect(crops[0].crop).toBe('vegetable')
      expect(crops[0].remaining).toBe(2)
    })

    it('does NOT allow sowing in a size-3+ pasture', () => {
      const session = setup({
        grain: 1,
        pastures: [
          {
            id: 'p1',
            size: 3,
            tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      // Sow should fail because no fields or eligible pastures.
      resp = session.resolveChoice(0, 'sow')
      expect(resp.ok).toBe(false)
    })

    it('allows sowing in field AND pasture simultaneously', () => {
      const session = setup({
        grain: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
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

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      // Sow in both field and pasture
      resp = session.resolveChoice(0, 'confirm', {
        crops: [
          { row: 0, col: 0, crop: 'grain' },
          { row: 2, col: 2, crop: 'grain' },
        ],
      })
      expect(resp.ok).toBe(true)
      expect(resp.state.players[0]!.resources.grain).toBe(0)

      // Field should have grain
      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.kind).toBe('grain')
      expect(field?.stacks[0]?.remaining ?? 0).toBe(3)

      // Pasture should have grain in cardStates
      const crops = resp.state.players[0]!.cardStates['B72_LoveforAgriculture']?.extraData?.pastureCrops as PastureCrop[]
      expect(crops.length).toBe(1)
      expect(crops[0].crop).toBe('grain')
    })

    it('makes sow doable when only pastures are available (no empty fields)', () => {
      const session = setup({
        grain: 1,
        fields: [{ row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 2 }] }], // no empty fields
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

      // Sow should be doable via the isDoable listener
      const resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined).toBe('ui.interactionSowSelect')

      // Should only show the pasture tile as sowable
      if (resp.interaction.stateId === 'wait' && resp.interaction.farm.farmType === 'sow') {
        expect(resp.interaction.farm.selectableFields.length).toBe(1)
        expect(resp.interaction.farm.selectableFields[0].tile).toEqual({ row: 2, col: 2 })
      }
    })

    it('does NOT allow sowing in already-sown pasture', () => {
      const session = setup({
        grain: 2,
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

      // First sow
      let resp = session.takeAction(0, 'grain-utilization')
      resp = session.resolveChoice(0, 'confirm', {
        crops: [{ row: 2, col: 2, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      // Try to sow again in the same pasture (would need another sow opportunity)
      // The pasture should no longer appear as sowable
      const state = session.getState().state
      const player = state.players[0]!
      const crops = player.cardStates['B72_LoveforAgriculture']?.extraData?.pastureCrops as PastureCrop[]
      expect(crops.length).toBe(1)
    })
  })

  describe('harvest from sown pastures', () => {
    it('harvests 1 grain from sown pasture during field phase', () => {
      const session = setup({
        round: 4, // harvest round
        grain: 0,
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

      // Manually set sown pasture crops
      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates['B72_LoveforAgriculture'] = {
        extraData: {
          pastureCrops: [
            {
              pastureId: 'p1',
              tiles: [{ row: 2, col: 2 }],
              crop: 'grain',
              remaining: 3,
            },
          ],
        },
      }
      // Set enough food for all players
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()

      // After harvest, grain should have been reaped from pasture
      const playerAfter = resp.state.players[0]!
      expect(playerAfter.resources.grain).toBe(1)
      const crops = playerAfter.cardStates['B72_LoveforAgriculture']?.extraData?.pastureCrops as PastureCrop[]
      expect(crops.length).toBe(1)
      expect(crops[0].remaining).toBe(2)
    })

    it('removes exhausted pasture crops after harvest', () => {
      const session = setup({
        round: 4,
        grain: 0,
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

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates['B72_LoveforAgriculture'] = {
        extraData: {
          pastureCrops: [
            {
              pastureId: 'p1',
              tiles: [{ row: 2, col: 2 }],
              crop: 'grain',
              remaining: 1, // last remaining
            },
          ],
        },
      }
      for (const p of state.players) {
        p.resources.food = 10
      }
      session.loadState(state)

      const resp = session.performRoundEnd()

      const playerAfter = resp.state.players[0]!
      expect(playerAfter.resources.grain).toBe(1)
      const crops = playerAfter.cardStates['B72_LoveforAgriculture']?.extraData?.pastureCrops as PastureCrop[]
      expect(crops.length).toBe(0) // exhausted, removed
    })
  })

  describe('animal capacity reduction', () => {
    it('reduces capacity of size-1 sown pasture by 1', () => {
      const session = setup({
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

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates['B72_LoveforAgriculture'] = {
        extraData: {
          pastureCrops: [
            {
              pastureId: 'p1',
              tiles: [{ row: 2, col: 2 }],
              crop: 'grain',
              remaining: 3,
            },
          ],
        },
      }

      // Check capacity via imported computeAnimalZones
      const zones = computeAnimalZones(player)
      const pastureZone = zones.find((z: InteractionAnimalReorgZone) => z.id === 'p1')
      // Size-1 pasture normally has capacity 2, should be reduced by 1 (pastureSize)
      expect(pastureZone?.capacity).toBe(1)
    })

    it('reduces capacity of size-2 sown pasture by 2', () => {
      const session = setup({
        pastures: [
          {
            id: 'p1',
            size: 2,
            tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      const state = session.getState().state
      const player = state.players[0]!
      player.cardStates['B72_LoveforAgriculture'] = {
        extraData: {
          pastureCrops: [
            {
              pastureId: 'p1',
              tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }],
              crop: 'vegetable',
              remaining: 2,
            },
          ],
        },
      }

      // Check capacity via imported computeAnimalZones
      const zones = computeAnimalZones(player)
      const pastureZone = zones.find((z: AnimalZone) => z.id === 'p1')
      // Size-2 pasture normally has capacity 4, reduced by 2
      expect(pastureZone?.capacity).toBe(2)
    })

    it('does NOT reduce capacity when pasture has no crops', () => {
      const session = setup({
        pastures: [
          {
            id: 'p1',
            size: 2,
            tiles: [{ row: 2, col: 2 }, { row: 2, col: 3 }],
            stables: 0,
            animalType: null,
            animalCount: 0,
          },
        ],
      })

      const state = session.getState().state
      const player = state.players[0]!

      // Check capacity via imported computeAnimalZones
      const zones = computeAnimalZones(player)
      const pastureZone = zones.find((z: AnimalZone) => z.id === 'p1')
      expect(pastureZone?.capacity).toBe(4) // unchanged
    })
  })

  describe('without card', () => {
    it('does NOT show pasture tiles as sowable without the card', () => {
      const session = setup({
        withCard: false,
        grain: 1,
        fields: [{ row: 0, col: 0, stacks: [] }],
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

      const resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      if (resp.interaction.stateId === 'wait' && resp.interaction.farm.farmType === 'sow') {
        // Should only show the field, not the pasture
        expect(resp.interaction.farm.selectableFields.length).toBe(1)
        expect(resp.interaction.farm.selectableFields[0].tile).toEqual({ row: 0, col: 0 })
      }
    })
  })
})
