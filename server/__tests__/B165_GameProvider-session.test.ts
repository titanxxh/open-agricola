import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'

import { markAllWorkersUsed, setActiveWorkerCount } from '../../shared/domain/player'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import '../../shared/cards/B/B165_GameProvider'
import { resolveNonSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

const CARD_ID = 'B165_GameProvider'

const setupHarvest = (
  fields: PlayerState['fields'] = [
    { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
    { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
    { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
  ],
) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    markAllWorkersUsed(state, player)
    setActiveWorkerCount(player, 1)
    player.resources.food = 20
    player.resources.boar = 0
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.fields = []
  })

  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.fields = fields
  session.loadState(state)
  return session
}

const acceptB165 = (session: GameSession) => {
  let resp = session.performRoundEnd()
  resp = resolveTriggerIfPresent(session, resp, CARD_ID)
  resp = resolveNonSkipChoice(session, resp)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected selection choice')
  expect(resp.interaction.sourceCard).toBe(CARD_ID)
  expect(resp.interaction.selection?.kind).toBe('farm-position')
  return resp
}

const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
  session.commitSelectionChoice(0, { positions })

const fieldCounts = (player: PlayerState) =>
  player.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)

describe('B165_GameProvider session', () => {
  it('lets player discard 1 grain field for 1 boar', () => {
    const session = setupHarvest()
    let resp = acceptB165(session)

    expect(resp.interaction.selection?.selectablePositions).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])

    resp = selectPositions(session, [{ row: 0, col: 0 }])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(1)
    expect(fieldCounts(player)).toEqual([1, 2, 2])
  })

  it('rejects exactly 2 selected grain fields without mutating grain or boar', () => {
    const session = setupHarvest()
    let resp = acceptB165(session)

    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection count')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).toBe(CARD_ID)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(0)
    expect(fieldCounts(player)).toEqual([3, 3, 3])
  })

  it('allows selecting 3 grain fields and preserves deterministic harvest state', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 2, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 3, stacks: [{ kind: 'grain', remaining: 3 }] },
    ])
    let resp = acceptB165(session)

    resp = selectPositions(session, [
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 0, col: 2 },
    ])
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(3)
    expect(fieldCounts(player)).toEqual([1, 1, 1, 2])
  })

  it('rejects non-selectable crop field without partial mutation', () => {
    const session = setupHarvest([
      { row: 0, col: 0, stacks: [{ kind: 'grain', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
    ])
    let resp = acceptB165(session)

    expect(resp.interaction.selection?.selectablePositions).toEqual([{ row: 0, col: 0 }])
    resp = selectPositions(session, [{ row: 0, col: 1 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')

    const player = resp.state.players[0]!
    expect(player.resources.boar).toBe(0)
    expect(fieldCounts(player)).toEqual([3, 2])
  })
})
