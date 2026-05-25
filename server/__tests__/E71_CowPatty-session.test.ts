import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { setWorkersAtHome } from '../../shared/domain/player'
import type { ActionChoiceOption, FarmTilePosition } from '../../shared/contract/types'
import { E71_CowPatty } from '../../shared/cards-display/E/E71_CowPatty'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'E71_CowPatty'

describe('E71_CowPatty session', () => {
  // Default rooms are at (2,0) and (1,0) — avoid those positions for fields/pastures
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
  }) => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1
    state.roundPhase = 'work'
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
      player.minorPlayed.push(CARD_ID)
    }

    session.loadState(state)
    return session
  }

  const acceptSelection = (session: GameSession, resp: ReturnType<GameSession['resolveChoice']>) => {
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected optional choice')
    const accept = resp.interaction.options?.find((option: ActionChoiceOption) => option.value !== '__skip__')
    expect(accept).toBeDefined()
    resp = session.resolveChoice(0, accept!.value)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
    expect(resp.interaction.sourceCard).toBe(CARD_ID)
    expect(resp.interaction.selection?.kind).toBe('farm-position')
    return resp
  }

  const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
    session.commitSelectionChoice(0, { positions })

  it('offers optional selection and adds 1 bonus crop when sowing adjacent to a pasture', () => {
    // Field at (0,2), pasture at (0,3) — orthogonally adjacent
    const session = setup({
      grain: 2,
      fields: [{ row: 0, col: 2, stacks: [] }],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 3 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = acceptSelection(session, resp)
    expect(resp.interaction.selection?.selectablePositions).toEqual([{ row: 0, col: 2 }])
    resp = selectPositions(session, [{ row: 0, col: 2 }])
    expect(resp.ok).toBe(true)

    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.kind).toBe('grain')
    expect(field?.stacks[0]?.remaining ?? 0).toBe(4)
  })

  it('skip leaves a single eligible field at its normal sow count', () => {
    const session = setup({
      grain: 2,
      fields: [{ row: 0, col: 2, stacks: [] }],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 3 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    resp = session.resolveChoice(0, '__skip__')

    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.remaining ?? 0).toBe(3)
  })

  it('does NOT add bonus crop when field is NOT adjacent to a pasture', () => {
    // Field at (0,2), pasture at (2,4) — not adjacent
    const session = setup({
      grain: 2,
      fields: [{ row: 0, col: 2, stacks: [] }],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 2, col: 4 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    {
      let safety = 16
      while (resp.interaction.stateId === 'wait' && safety-- > 0) {
        const next = resp.interaction.options?.[0]?.value
        if (!next) break
        resp = session.resolveChoice(resp.interaction.playerIndex, next)
      }
    }

    // Field should have 3 grain (normal, no bonus)
    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.remaining ?? 0).toBe(3)
  })

  it('does NOT add bonus crop without the card', () => {
    const session = setup({
      withCard: false,
      grain: 2,
      fields: [{ row: 0, col: 2, stacks: [] }],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 3 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    {
      let safety = 16
      while (resp.interaction.stateId === 'wait' && safety-- > 0) {
        const next = resp.interaction.options?.[0]?.value
        if (!next) break
        resp = session.resolveChoice(resp.interaction.playerIndex, next)
      }
    }

    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.remaining ?? 0).toBe(3) // no bonus
  })

  it('does NOT add bonus when player has no pastures', () => {
    const session = setup({
      grain: 2,
      fields: [{ row: 0, col: 2, stacks: [] }],
      pastures: [], // no pastures
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    {
      let safety = 16
      while (resp.interaction.stateId === 'wait' && safety-- > 0) {
        const next = resp.interaction.options?.[0]?.value
        if (!next) break
        resp = session.resolveChoice(resp.interaction.playerIndex, next)
      }
    }

    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.remaining ?? 0).toBe(3) // no bonus
  })

  it('adds bonus to vegetable sow adjacent to pasture', () => {
    // Field at (0,2), pasture at (0,1) — adjacent
    const session = setup({
      vegetable: 2,
      fields: [{ row: 0, col: 2, stacks: [] }],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 1 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'vegetable' }],
    })
    expect(resp.ok).toBe(true)

    resp = acceptSelection(session, resp)
    resp = selectPositions(session, [{ row: 0, col: 2 }])
    expect(resp.ok).toBe(true)

    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.kind).toBe('vegetable')
    expect(field?.stacks[0]?.remaining ?? 0).toBe(3) // 2 normal + 1 bonus
  })

  it('handles sowing in 2 fields — only adjacent one gets bonus', () => {
    // Field at (0,2) is adjacent to pasture at (0,3)
    // Field at (2,4) is NOT adjacent to any pasture
    const session = setup({
      grain: 3,
      fields: [
        { row: 0, col: 2, stacks: [] },
        { row: 2, col: 4, stacks: [] },
      ],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 3 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [
        { row: 0, col: 2, crop: 'grain' },
        { row: 2, col: 4, crop: 'grain' },
      ],
    })
    expect(resp.ok).toBe(true)

    resp = acceptSelection(session, resp)
    expect(resp.interaction.selection?.selectablePositions).toEqual([{ row: 0, col: 2 }])
    resp = selectPositions(session, [{ row: 0, col: 2 }])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const f0 = player.fields.find((f) => f.row === 0 && f.col === 2)
    expect(f0?.stacks[0]?.remaining ?? 0).toBe(4) // 3 + 1 bonus

    const f1 = player.fields.find((f) => f.row === 2 && f.col === 4)
    expect(f1?.stacks[0]?.remaining ?? 0).toBe(3) // no bonus
  })

  it('handles sowing in 2 fields both adjacent to pastures — presents choice', () => {
    // Both fields adjacent to the same pasture
    // Field at (0,2) adjacent to pasture at (0,3)
    // Field at (0,4) adjacent to pasture at (0,3)
    const session = setup({
      grain: 3,
      fields: [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 4, stacks: [] },
      ],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 3 }], // adjacent to both (0,2) and (0,4)
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [
        { row: 0, col: 2, crop: 'grain' },
        { row: 0, col: 4, crop: 'grain' },
      ],
    })
    expect(resp.ok).toBe(true)

    resp = acceptSelection(session, resp)
    expect(resp.interaction.selection?.selectablePositions).toEqual([
      { row: 0, col: 2 },
      { row: 0, col: 4 },
    ])
    resp = selectPositions(session, [{ row: 0, col: 2 }])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    const f0 = player.fields.find((f) => f.row === 0 && f.col === 2)
    const f4 = player.fields.find((f) => f.row === 0 && f.col === 4)
    const total = (f0?.stacks[0]?.remaining ?? 0 ?? 0) + (f4?.stacks[0]?.remaining ?? 0 ?? 0)
    expect(total).toBe(7)
  })

  it('rejects a non-eligible crop field without partial mutation', () => {
    const session = setup({
      grain: 2,
      fields: [
        { row: 0, col: 2, stacks: [] },
        { row: 0, col: 4, stacks: [{ kind: 'grain', remaining: 3 }] },
      ],
      pastures: [
        {
          id: 'p1',
          size: 1,
          tiles: [{ row: 0, col: 3 }],
          stables: 0,
          animalType: null,
          animalCount: 0,
        },
      ],
    })

    let resp = session.takeAction(0, 'grain-utilization')
    expect(resp.ok).toBe(true)

    resp = session.commitSelectionChoice(0, {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    resp = acceptSelection(session, resp)
    expect(resp.interaction.selection?.selectablePositions).toEqual([{ row: 0, col: 2 }])
    resp = selectPositions(session, [{ row: 0, col: 4 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')

    const player = resp.state.players[0]!
    const eligible = player.fields.find((f) => f.row === 0 && f.col === 2)
    const ineligible = player.fields.find((f) => f.row === 0 && f.col === 4)
    expect(eligible?.stacks[0]?.remaining ?? 0).toBe(3)
    expect(ineligible?.stacks[0]?.remaining ?? 0).toBe(3)
  })

  describe('prerequisite "1 Cattle"', () => {
    it('blocks when player has no cattle on board', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.pastures = []
      player.houseAnimalType = null
      player.houseAnimalCount = 0
      player.stableAnimals = {}
      expect(meetsCardPrerequisites(player, E71_CowPatty, state.round, state)).toBe(false)
    })

    it('allows when player has at least 1 cattle on board', () => {
      const session = new GameSession()
      const state = session.getState().state
      const player = state.players[0]!
      player.pastures = [{
        id: 'p1',
        tiles: [{ row: 0, col: 0 }],
        animalType: 'cattle',
        animalCount: 1,
        size: 1,
        stables: 0,
      }]
      expect(meetsCardPrerequisites(player, E71_CowPatty, state.round, state)).toBe(true)
    })
  })
})
