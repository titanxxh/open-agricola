import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'

import '../../shared/cards/B/B85_FarmHand'

const CARD_ID = 'B85_FarmHand'

const PLACEHOLDER = ['__test_placeholder__']

const make2x2Fields = (): FarmTilePosition[] => [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
]

const setupBuildStables = (overrides: Partial<PlayerState> = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.currentPlayerIndex = 0
  for (const p of state.players) {
    p.minorHand = [...PLACEHOLDER]
    p.occupationHand = [...PLACEHOLDER]
  }
  const player = state.players[0]!
  player.occupationPlayed.push(CARD_ID)
  player.resources = { ...player.resources, wood: 5, food: 10, reed: 2 }
  player.fields = make2x2Fields().map((t) => ({ ...t, stacks: [] }))
  Object.assign(player, overrides)
  session.loadState(state)
  return session
}

const enterStableSelect = (session: GameSession) => {
  let resp = session.takeAction(0, 'farm-expansion')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  const stableOption = resp.interaction.options?.find(
    (option) => option.labelKey === 'actions.stables.name',
  )
  expect(stableOption).toBeDefined()
  resp = session.resolveChoice(0, stableOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

describe('B85 FarmHand — build through Build Stables farm-select', () => {
  it('solo-builds the FarmHand stable from the stable farm-select', () => {
    const session = setupBuildStables()
    const resp = enterStableSelect(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const farm = resp.interaction.farm
    expect(farm?.farmType).toBe('stable')
    if (farm?.farmType !== 'stable') return

    const candidates = farm.farmHandPositions
    expect(candidates).toEqual([{ row: 0, col: 2 }])

    const before = getAvailableStableSupplyCount(resp.state, resp.state.players[0]!)
    const woodBefore = resp.state.players[0]!.resources.wood

    const commit = session.commitSelectionChoice(0, { farmHand: { row: 0, col: 2 } })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    expect(after.resources.wood).toBe(woodBefore - 2)
    expect(after.cardStates?.[CARD_ID]?.extraData?.position).toEqual({ row: 0, col: 2 })
    expect(after.cardStates?.[CARD_ID]?.flagged).toBe(true)
    expect(after.stableTiles.length).toBe(0)
    expect(getAvailableStableSupplyCount(commit.state, after)).toBe(before - 1)
  })
})
