import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/C/C088_CarpentersApprentice'

const PLACEHOLDER = ['__test_placeholder__']

const setup = (overrides: Partial<PlayerState> = {}, withC88 = true) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  for (const p of state.players) {
    p.minorHand = [...PLACEHOLDER]
    p.occupationHand = [...PLACEHOLDER]
  }
  const player = state.players[0]!
  if (withC88) player.occupationPlayed.push('C088_CarpentersApprentice')
  player.resources = { ...player.resources, wood: 3, food: 10, reed: 2 }
  Object.assign(player, overrides)
  session.loadState(state)
  return session
}

const enterStableSelect = (session: GameSession) => {
  let resp = session.takeAction(0, 'farm-expansion')
  expect(resp.ok).toBe(true)
  if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
  // When room is also doable (e.g. C88 makes construct affordable) the entry
  // shows a room/stables menu; otherwise farm-expansion auto-resolves straight
  // into the stable farm-select.
  const isStableSelect = resp.interaction.request.options?.some(
    (option) => option.labelKey === 'ui.interactionStableConfirm',
  )
  if (isStableSelect) return resp
  const stableOption = resp.interaction.request.options?.find(
    (option) => option.labelKey === 'actions.stables.name',
  )
  expect(stableOption).toBeDefined()
  resp = session.resolveChoice(0, stableOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const oneOrdinaryStable: FarmTilePosition[] = [{ row: 0, col: 4 }]

describe('C88 stable affordability — count-dependent total cost', () => {
  it('1 card-facing stable + 3 wood + C88 → maxSelections=2 (第2座 2 + 第3座折后 1 = 3)', () => {
    const session = setup({ stableTiles: oneOrdinaryStable } as Partial<PlayerState>)
    const resp = enterStableSelect(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const farm = resp.interaction.request.farm
    if (farm.farmType !== 'stable') throw new Error('expected stable farm-select')
    // 第2座: before=1,after=2 → 无折扣 → 2 wood。
    // 第3座: before=1,after=3 → 跨第3座 -1 → (2*2)-1 = 3 wood 总额，玩家恰好够。
    expect(farm.maxSelections).toBe(2)
  })

  it('反向: 无 C88 时 1 stable + 3 wood → maxSelections=1 (折扣不被错误放大)', () => {
    const session = setup({ stableTiles: oneOrdinaryStable } as Partial<PlayerState>, false)
    const resp = enterStableSelect(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const farm = resp.interaction.request.farm
    if (farm.farmType !== 'stable') throw new Error('expected stable farm-select')
    // 无折扣: 2 座需 4 wood > 3 → 只能 1 座。
    expect(farm.maxSelections).toBe(1)
  })
})
