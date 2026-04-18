import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'

import { setWorkersAtHome } from '../../shared/game/player'
import '../../shared/cards/E/E71_CowPatty'

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
      player.minorPlayed.push(CARD_ID)
      player.playedCards = player.playedCards ?? []
      player.playedCards.push(`minor:${CARD_ID}`)
    }

    session.loadState(state)
    return session
  }

  it('adds 1 bonus crop when sowing in a field adjacent to a pasture', () => {
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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    // Continue through any remaining choices
    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
    }

    // Field should have 4 grain (3 normal + 1 bonus)
    const field = resp.state.players[0]!.fields.find((f) => f.row === 0 && f.col === 2)
    expect(field?.stacks[0]?.kind).toBe('grain')
    expect(field?.stacks[0]?.remaining ?? 0).toBe(4)
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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [{ row: 0, col: 2, crop: 'grain' }],
    })
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [{ row: 0, col: 2, crop: 'vegetable' }],
    })
    expect(resp.ok).toBe(true)

    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
    }

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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [
        { row: 0, col: 2, crop: 'grain' },
        { row: 2, col: 4, crop: 'grain' },
      ],
    })
    expect(resp.ok).toBe(true)

    // Continue through any remaining choices
    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
    }

    const player = resp.state.players[0]!
    // Adjacent field gets +1 bonus
    const f0 = player.fields.find((f) => f.row === 0 && f.col === 2)
    expect(f0?.stacks[0]?.remaining ?? 0).toBe(4) // 3 + 1 bonus

    // Non-adjacent field stays normal
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
    resp = session.resolveChoice(0, 'sow')
    expect(resp.ok).toBe(true)

    resp = session.commitFarmChoice(0, 'sow', {
      crops: [
        { row: 0, col: 2, crop: 'grain' },
        { row: 0, col: 4, crop: 'grain' },
      ],
    })
    expect(resp.ok).toBe(true)

    // Should get a field-select choice for which field gets the bonus
    if (resp.pending.type === 'choice') {
      resp = session.resolveChoice(0, '0-2')
      expect(resp.ok).toBe(true)
    }

    // Continue through any remaining choices
    while (resp.pending.type === 'choice') {
      resp = session.resolveChoice(resp.pending.playerIndex, resp.pending.options[0]?.value ?? 'ok')
    }

    const player = resp.state.players[0]!
    const f0 = player.fields.find((f) => f.row === 0 && f.col === 2)
    const f4 = player.fields.find((f) => f.row === 0 && f.col === 4)
    // Total should be 7 (3 + 3 + 1 bonus on selected field)
    const total = (f0?.stacks[0]?.remaining ?? 0 ?? 0) + (f4?.stacks[0]?.remaining ?? 0 ?? 0)
    expect(total).toBe(7)
  })
})
