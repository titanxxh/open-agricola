import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'

import { getTotalAnimalCapacity } from '../../shared/domain/animal-zones'

import '../../shared/cards/B/B085_FarmHand'
import '../../shared/cards/A/A043_FarmyardManure'
import '../../shared/cards/D/D166_StableMilker'
import '../../shared/cards/D/D168_Stockman'

const PLACEHOLDER = ['__test_placeholder__']
const FARM_HAND_TILE: FarmTilePosition = { row: 0, col: 2 }
const NORMAL_STABLE_TILE: FarmTilePosition = { row: 2, col: 4 }

const make2x2Fields = (): FarmTilePosition[] => [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
]

const setup = (overrides: Partial<PlayerState> = {}) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 3
  for (const p of state.players) {
    p.minorHand = [...PLACEHOLDER]
    p.occupationHand = [...PLACEHOLDER]
  }
  const player = state.players[0]!
  player.occupationPlayed.push('B085_FarmHand')
  player.resources = { ...player.resources, wood: 10, food: 10, reed: 2 }
  player.fields = make2x2Fields().map((t) => ({ ...t, stacks: [] }))
  Object.assign(player, overrides)
  session.loadState(state)
  return session
}

const enterStableSelect = (session: GameSession) => {
  let resp = session.takeAction(0, 'farm-expansion')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  const stableOption = resp.interaction.request.options?.find(
    (option) => option.labelKey === 'actions.stables.name',
  )
  expect(stableOption).toBeDefined()
  resp = session.resolveChoice(0, stableOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

describe('after-stables built count — B85 counts as a built stable (#185)', () => {
  it('A43 (fires on ≥1 built stable) triggers for a B85 solo build', () => {
    const session = setup({
      minorPlayed: ['A043_FarmyardManure'],
      houseAnimalCount: 1,
    } as Partial<PlayerState>)
    enterStableSelect(session)
    const commit = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(commit.ok).toBe(true)

    const playerId = commit.state.players[0]!.id
    const entries = commit.state.futureMeeples.filter(
      (e) => e.cardId === 'A043_FarmyardManure' && e.playerId === playerId,
    )
    expect(entries).toHaveLength(3)
  })

  it('D166 (requires 2 built stables) triggers for a mixed ordinary + B85 build', () => {
    const session = setup({
      occupationPlayed: ['B085_FarmHand', 'D166_StableMilker'],
    } as Partial<PlayerState>)
    enterStableSelect(session)
    const cattleBefore = session.getState().state.players[0]!.resources.cattle ?? 0
    const commit = session.commitSelectionChoice(0, {
      stables: [NORMAL_STABLE_TILE],
      farmHand: FARM_HAND_TILE,
    })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    expect(after.resources.cattle ?? 0).toBe(cattleBefore + 1)
  })

  it('D166 does not trigger for a B85 solo build (only 1 stable built)', () => {
    const session = setup({
      occupationPlayed: ['B085_FarmHand', 'D166_StableMilker'],
    } as Partial<PlayerState>)
    enterStableSelect(session)
    const cattleBefore = session.getState().state.players[0]!.resources.cattle ?? 0
    const commit = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    expect(after.resources.cattle ?? 0).toBe(cattleBefore)
  })

  it('D168 counts the B85 stable in the "which stable" index (mixed build)', () => {
    // 1 ordinary stable already → card-facing count 1. Same action builds
    // 1 ordinary (2nd stable → cattle) + B85 (3rd stable → boar).
    const session = setup({
      occupationPlayed: ['B085_FarmHand', 'D168_Stockman'],
      stableTiles: [{ row: 0, col: 4 }],
    } as Partial<PlayerState>)
    enterStableSelect(session)
    const before = session.getState().state.players[0]!.resources
    const cattleBefore = before.cattle ?? 0
    const boarBefore = before.boar ?? 0

    const commit = session.commitSelectionChoice(0, {
      stables: [NORMAL_STABLE_TILE],
      farmHand: FARM_HAND_TILE,
    })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    expect(after.resources.cattle ?? 0).toBe(cattleBefore + 1)
    expect(after.resources.boar ?? 0).toBe(boarBefore + 1)
  })

  it('does not count the B85 stable toward animal capacity', () => {
    const session = setup({
      occupationPlayed: ['B085_FarmHand', 'D166_StableMilker'],
    } as Partial<PlayerState>)
    enterStableSelect(session)
    const capacityBefore = getTotalAnimalCapacity(
      session.getState().state.players[0]!,
      session.getState().state,
    )
    const commit = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    // B85 solo build adds no animal capacity (still the same as before).
    expect(getTotalAnimalCapacity(after, commit.state)).toBe(capacityBefore)
  })
})
