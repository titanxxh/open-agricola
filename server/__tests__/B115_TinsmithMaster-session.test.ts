import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { computeAnimalZones } from '../../shared/domain/animal-zones'

import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption, FarmTilePosition } from '../../shared/contract/types'
import '../../shared/cards/B/B115_TinsmithMaster'

const CARD_ID = 'B115_TinsmithMaster'
const FILLER = '__test_placeholder__'

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
    const session = new GameSession(42)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = options?.pastures ? 14 : 1
    state.roundPhase = 'work'
    state.roundActionOrder = state.roundActionOrder.map(() => null)
    state.roundActionOrder[0] = options?.withCard === false ? 'lessons' : 'grain-utilization'
    state.roundActionOrder[1] = 'sheep-market'

    state.players.forEach((candidate) => {
      candidate.minorHand = [FILLER]
      candidate.occupationHand = [FILLER]
    })
    const player = state.players[0]!
    setWorkersAtHome(state, player, 2)
    player.resources.food = 10
    player.resources.grain = options?.grain ?? 0
    player.resources.vegetable = options?.vegetable ?? 0
    player.fields = options?.fields ?? []
    player.pastures = options?.pastures ?? []

    player.occupationPlayed = options?.withCard ?? true ? [CARD_ID] : []
    player.occupationHand = options?.withCard ?? true ? [FILLER] : [CARD_ID]

    session.loadState(state)
    return session
  }

  const playOccupation = (session: GameSession) => {
    const response = session.takeAction(0, 'lessons')
    if (!response.state.players[0]!.occupationHand.includes(CARD_ID)) return response
    expect(response.interaction.stateId).toBe('wait')
    if (response.interaction.stateId !== 'wait') return response
    const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
    expect(option, JSON.stringify(response.interaction)).toBeDefined()
    return session.resolveChoice(0, option!.value)
  }

  const placeMarketSheep = (session: GameSession, pastureCount: number, houseCount: number) => {
    const state = session.getState().state
    state.actionSpaces.find((space) => space.id === 'sheep-market')!.resources.sheep = pastureCount + houseCount
    session.loadState(state)
    const pending = session.takeAction(0, 'sheep-market')
    expect(pending.ok, pending.error).toBe(true)
    expect(pending.interaction).toMatchObject({ stateId: 'wait', request: { kind: 'animal-reorg' } })
    return session.resolveChoice(0, 'confirm', {
      zones: [
        { id: 'p1', zoneType: 'pasture', animalType: 'sheep', animalCount: pastureCount },
        ...(houseCount > 0
          ? [{ id: 'house', zoneType: 'house', animalType: 'sheep', animalCount: houseCount }]
          : []),
      ],
    })
  }

  it('B115 S1: playing Tinsmith Master through Lessons leaves it in play', () => {
    const response = playOccupation(setupForSow({ withCard: false }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.occupationPlayed).toContain(CARD_ID)
  })

  // --- Animal capacity tests ---

  describe('pasture capacity', () => {
    it('B115 S2: a one-space pasture without a stable holds three sheep', () => {
      const session = setupForSow({
        pastures: [{
          id: 'p1', size: 1, tiles: [{ row: 0, col: 0 }], stables: 0,
          animalType: null, animalCount: 0,
        }],
      })

      const response = placeMarketSheep(session, 3, 0)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.pastures[0]).toMatchObject({
        animalType: 'sheep', animalCount: 3,
      })
    })

    it('B115 S3: a one-space pasture with a stable still holds only four sheep', () => {
      const session = setupForSow({
        pastures: [{
          id: 'p1', size: 1, tiles: [{ row: 0, col: 0 }], stables: 1,
          animalType: null, animalCount: 0,
        }],
      })
      const state = session.getState().state
      state.players[0]!.stableTiles = [{ row: 0, col: 0 }]
      session.loadState(state)

      const response = placeMarketSheep(session, 4, 1)

      expect(response.ok, response.error).toBe(true)
      expect(response.state.players[0]!.pastures[0]).toMatchObject({
        animalType: 'sheep', animalCount: 4,
      })
    })

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
    const acceptSelection = (session: GameSession, resp: ReturnType<GameSession['resolveChoice']>) => {
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
      const accept = resp.interaction.request.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
      expect(accept).toBeDefined()
      resp = session.resolveChoice(0, accept!.value)
      expect(resp.interaction.stateId).toBe('wait')
      if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
      expect(resp.interaction.sourceCard).toBe(CARD_ID)
      expect(resp.interaction.request.selection?.kind).toBe('farm-position')
      return resp
    }

    const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
      session.commitSelectionChoice(0, { positions })

    it('B115 S4: accepting after sowing grain adds one crop to the normal stack', () => {
      const session = setupForSow({
        grain: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      // Sow grain in the field
      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      resp = acceptSelection(session, resp)
      expect(resp.interaction.request.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])
      resp = selectPositions(session, [{ row: 0, col: 0 }])
      expect(resp.ok).toBe(true)

      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.kind).toBe('grain')
      expect(field?.stacks[0]?.remaining ?? 0).toBe(4)
    })

    it('B115 S5: declining after sowing leaves the normal crop count', () => {
      const session = setupForSow({
        grain: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)
      expect(resp.interaction.stateId).toBe('wait')
      resp = session.resolveChoice(0, '__skip__')

      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.remaining ?? 0).toBe(3)
    })

    it('B115 S6: accepting after sowing vegetables adds one vegetable', () => {
      const session = setupForSow({
        vegetable: 2,
        fields: [{ row: 0, col: 0, stacks: [] }],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 0, crop: 'vegetable' }],
      })
      expect(resp.ok).toBe(true)

      resp = acceptSelection(session, resp)
      resp = selectPositions(session, [{ row: 0, col: 0 }])
      expect(resp.ok).toBe(true)

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
      expect(resp.ok).toBe(true)

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      while (resp.interaction.stateId === 'wait') {
        if (resp.interaction.request.kind !== 'choice') break
        resp = session.resolveChoice(resp.interaction.playerIndex, resp.interaction.request.options?.[0]?.value ?? 'ok')
      }

      const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 0)
      expect(field?.stacks[0]?.remaining ?? 0).toBe(3) // normal grain sow, no bonus
    })

    it('B115 S7: after sowing two fields the bonus may be limited to one selected field', () => {
      const session = setupForSow({
        grain: 3,
        fields: [
          { row: 0, col: 0, stacks: [] },
          { row: 0, col: 1, stacks: [] },
        ],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)
      expect(resp.ok).toBe(true)

      // Sow grain in both fields
      resp = session.commitSelectionChoice(0, {
        crops: [
          { row: 0, col: 0, crop: 'grain' },
          { row: 0, col: 1, crop: 'grain' },
        ],
      })
      expect(resp.ok).toBe(true)

      resp = acceptSelection(session, resp)
      expect(resp.interaction.request.selection?.selectablePositions).toEqual([
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ])
      resp = selectPositions(session, [{ row: 0, col: 0 }])
      expect(resp.ok).toBe(true)

      const player = resp.state.players[0]!
      const f0 = player.fields.find((f) => f.row === 0 && f.col === 0)
      const f1 = player.fields.find((f) => f.row === 0 && f.col === 1)
      expect(f0?.stacks[0]?.remaining ?? 0).toBe(4)
      expect(f1?.stacks[0]?.remaining ?? 0).toBe(3)
    })

    it('rejects a crop field that was not freshly sown without partial mutation', () => {
      const session = setupForSow({
        grain: 2,
        fields: [
          { row: 0, col: 0, stacks: [] },
          { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
        ],
      })

      let resp = session.takeAction(0, 'grain-utilization')
      expect(resp.ok).toBe(true)

      resp = session.commitSelectionChoice(0, {
        crops: [{ row: 0, col: 0, crop: 'grain' }],
      })
      expect(resp.ok).toBe(true)

      resp = acceptSelection(session, resp)
      expect(resp.interaction.request.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])
      resp = selectPositions(session, [{ row: 0, col: 1 }])
      expect(resp.ok).toBe(false)
      expect(resp.error).toBe('invalid selection position')

      const player = resp.state.players[0]!
      const f0 = player.fields.find((f) => f.row === 0 && f.col === 0)
      const f1 = player.fields.find((f) => f.row === 0 && f.col === 1)
      expect(f0?.stacks[0]?.remaining ?? 0).toBe(3)
      expect(f1?.stacks[0]?.remaining ?? 0).toBe(3)
    })
  })
})
