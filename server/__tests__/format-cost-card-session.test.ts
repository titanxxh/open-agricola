import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import type { FenceSegment } from '../../shared/contract/types'

import '../../shared/cards/B/B2_MiniPasture'
import '../../shared/cards/B/B149_OpenAirFarmer'
import '../../shared/cards/C/C2_Stable'
import '../../shared/cards/E/E1_PoleBarns'

const FILLER = '__test_placeholder__'

const edgesForTile = (row: number, col: number) => [
  `H-${row}-${col}`,
  `H-${row + 1}-${col}`,
  `V-${row}-${col}`,
  `V-${row}-${col + 1}`,
]

const setupMinor = (cardId: string) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.minorHand = [cardId]
  player.resources = {
    ...player.resources,
    wood: 0,
    food: 0,
  }

  session.loadState(state)
  return session
}

const playPassingMinor = (session: GameSession, cardId: string) => {
  const action = session.takeAction(0, 'meeting-place')
  expect(action.ok).toBe(true)
  const played = session.resolveChoice(0, `minor:${cardId}`)
  expect(played.ok).toBe(true)
  return played
}

const setupOccupation = (cardId: string) => {
  const session = new GameSession(undefined, undefined, { playerCount: 4 })
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.round = 1

  for (const player of state.players) {
    setWorkersAtHome(state, player, 2)
    player.minorHand = [FILLER]
    player.occupationHand = [FILLER]
  }

  const player = state.players[0]!
  player.occupationHand = [cardId]
  player.resources = {
    ...player.resources,
    food: 10,
    wood: 2,
  }

  session.loadState(state)
  return session
}

const playOccupation = (session: GameSession, cardId: string) => {
  const action = session.takeAction(0, 'lessons-4')
  expect(action.ok).toBe(true)
  if (action.interaction.stateId !== 'wait') return action
  if (action.interaction.sourceCard === cardId) return action
  const option = action.interaction.options?.find((entry) => entry.value === cardId)
  expect(option).toBeDefined()
  const played = session.resolveChoice(0, option!.value)
  expect(played.ok).toBe(true)
  return played
}

describe('formatCost card session regressions', () => {
  it('C2_Stable builds its free stable after paying only the card wood cost', () => {
    const session = setupMinor('C2_Stable')
    const state = session.getState().state
    state.players[0]!.resources.wood = 1
    session.loadState(state)

    const played = playPassingMinor(session, 'C2_Stable')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('farm-select')

    const built = session.resolveChoice(0, 'confirm', {
      stables: [{ row: 0, col: 0 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
    expect(built.state.players[1]!.minorHand).toContain('C2_Stable')
  })

  it('E1_PoleBarns offers free stables after the card cost consumes all wood', () => {
    const session = setupMinor('E1_PoleBarns')
    const state = session.getState().state
    state.players[0]!.resources.wood = 2
    state.players[0]!.fenceSegments = Array.from({ length: 15 }, (_, index): FenceSegment => ({
      edge: `test-edge-${index}`,
      type: 'fence',
    }))
    session.loadState(state)

    const played = playPassingMinor(session, 'E1_PoleBarns')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('choice')
    const buildOption = played.interaction.options?.find((option) => option.value !== '__skip__')
    expect(buildOption).toBeDefined()

    const prompt = session.resolveChoice(0, buildOption!.value)
    expect(prompt.ok).toBe(true)
    expect(prompt.interaction.stateId).toBe('wait')
    if (prompt.interaction.stateId !== 'wait') return
    expect(prompt.interaction.request.kind).toBe('farm-select')

    const built = session.resolveChoice(0, 'confirm', {
      stables: [{ row: 0, col: 0 }],
    })
    expect(built.ok).toBe(true)
    expect(built.state.players[0]!.resources.wood).toBe(0)
    expect(built.state.players[0]!.stableTiles).toContainEqual({ row: 0, col: 0 })
  })

  it('B2_MiniPasture fences one tile without requiring wood after paying food cost', () => {
    const session = setupMinor('B2_MiniPasture')
    const state = session.getState().state
    state.players[0]!.resources.food = 2
    state.players[0]!.resources.wood = 0
    session.loadState(state)

    const played = playPassingMinor(session, 'B2_MiniPasture')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('farm-select')
    expect(played.interaction.farm.farmType).toBe('fence')

    const fenced = session.resolveChoice(0, 'confirm', {
      edges: edgesForTile(0, 0),
      extraWood: 0,
    })
    expect(fenced.ok).toBe(true)
    expect(fenced.state.players[0]!.resources.food).toBe(0)
    expect(fenced.state.players[0]!.resources.wood).toBe(0)
    expect(fenced.state.players[0]!.fenceSegments).toHaveLength(4)
    expect(fenced.state.players[1]!.minorHand).toContain('B2_MiniPasture')
  })

  it('B149_OpenAirFarmer rejects one-cell pasture and accepts two-cell pasture', () => {
    const session = setupOccupation('B149_OpenAirFarmer')

    const played = playOccupation(session, 'B149_OpenAirFarmer')
    expect(played.interaction.stateId).toBe('wait')
    if (played.interaction.stateId !== 'wait') return
    expect(played.interaction.request.kind).toBe('farm-select')
    expect(played.interaction.farm.farmType).toBe('fence')

    const cancel = session.resolveChoice(0, 'cancel')
    expect(cancel.ok).toBe(false)

    const oneCell = session.resolveChoice(0, 'confirm', {
      edges: edgesForTile(0, 0),
      extraWood: 0,
    })
    expect(oneCell.ok).toBe(false)

    const twoCells = session.resolveChoice(0, 'confirm', {
      edges: ['H-0-0', 'H-0-1', 'H-1-0', 'H-1-1', 'V-0-0', 'V-0-2'],
      extraWood: 0,
    })
    expect(twoCells.ok).toBe(true)
    expect(twoCells.state.players[0]!.occupationPlayed).toContain('B149_OpenAirFarmer')
    expect(twoCells.state.players[0]!.resources.wood).toBe(0)
    expect(twoCells.state.players[0]!.pastures).toHaveLength(1)
    expect(twoCells.state.players[0]!.pastures[0]?.tiles).toHaveLength(2)
  })
})
