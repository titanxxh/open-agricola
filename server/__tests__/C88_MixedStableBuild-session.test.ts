import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import type { GameEvent } from '../../shared/contract/events'

import '../../shared/cards/C/C88_CarpentersApprentice'
import '../../shared/cards/B/B85_FarmHand'

const PLACEHOLDER = ['__test_placeholder__']
const FARM_HAND_TILE: FarmTilePosition = { row: 0, col: 2 }
const NORMAL_STABLE_TILE: FarmTilePosition = { row: 2, col: 4 }

// 2x2 field block centred on FARM_HAND_TILE (cols 2-3, rows 0-1).
const make2x2Fields = (): FarmTilePosition[] => [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
]

const setup = (overrides: Partial<PlayerState> = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0
  for (const p of state.players) {
    p.minorHand = [...PLACEHOLDER]
    p.occupationHand = [...PLACEHOLDER]
  }
  const player = state.players[0]!
  player.occupationPlayed.push('C88_CarpentersApprentice', 'B85_FarmHand')
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
  const stableOption = resp.interaction.options?.find(
    (option) => option.labelKey === 'actions.stables.name',
  )
  expect(stableOption).toBeDefined()
  resp = session.resolveChoice(0, stableOption!.value)
  expect(resp.ok).toBe(true)
  return resp
}

const findStableBuiltStables = (events: readonly GameEvent[]) =>
  events
    .filter((event): event is Extract<GameEvent, { type: 'farm.stableBuilt' }> =>
      event.type === 'farm.stableBuilt',
    )
    .flatMap((event) => event.stables)

describe('C88 + B85 — mixed ordinary + FarmHand stable build', () => {
  it('已有 2 座 card-facing stable + 同次建 1 普通 + B85 → 第 3/4 座各 -1 wood (总折扣 -2)', () => {
    const session = setup({
      stableTiles: [
        { row: 0, col: 4 },
        { row: 1, col: 4 },
      ],
    } as Partial<PlayerState>)

    const resp = enterStableSelect(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    const supplyBefore = getAvailableStableSupplyCount(resp.state, resp.state.players[0]!)
    const woodBefore = resp.state.players[0]!.resources.wood

    const commit = session.commitSelectionChoice(0, {
      stables: [NORMAL_STABLE_TILE],
      farmHand: FARM_HAND_TILE,
    })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    // base 2 units * 2 wood = 4; C88 discount -2 (3rd + 4th) → pay 2.
    expect(after.resources.wood).toBe(woodBefore - 2)
    // ordinary stable placed; B85 stable NOT in stableTiles.
    expect(after.stableTiles).toEqual([
      { row: 0, col: 4 },
      { row: 1, col: 4 },
      NORMAL_STABLE_TILE,
    ])
    expect(after.cardStates?.B85_FarmHand?.extraData?.position).toEqual(FARM_HAND_TILE)
    // supply: 1 normal + 1 farmhand → -2.
    expect(getAvailableStableSupplyCount(commit.state, after)).toBe(supplyBefore - 2)

    const stables = findStableBuiltStables(commit.state.events)
    expect(stables).toEqual([
      {
        playerId: after.id,
        row: NORMAL_STABLE_TILE.row,
        col: NORMAL_STABLE_TILE.col,
        kind: 'normal',
      },
      {
        playerId: after.id,
        row: FARM_HAND_TILE.row,
        col: FARM_HAND_TILE.col,
        kind: 'special',
        sourceCardId: 'B85_FarmHand',
      },
    ])
  })

  it('总 supply 校验跨普通 + B85: 只剩 1 个 stable token 时拒绝 1 普通 + B85 (需 2)', () => {
    const session = setup({
      // 2 ordinary already built + 1 consumed token → only 1 token left,
      // but a mixed build of (1 ordinary + 1 FarmHand) needs 2.
      stableTiles: [
        { row: 0, col: 4 },
        { row: 1, col: 4 },
      ],
      supplyTokensConsumed: { stable: 1 },
    } as Partial<PlayerState>)

    const resp = enterStableSelect(session)
    if (resp.interaction.stateId !== 'wait') throw new Error('expected wait')
    expect(getAvailableStableSupplyCount(resp.state, resp.state.players[0]!)).toBe(1)
    const woodBefore = resp.state.players[0]!.resources.wood

    const commit = session.commitSelectionChoice(0, {
      stables: [NORMAL_STABLE_TILE],
      farmHand: FARM_HAND_TILE,
    })
    expect(commit.ok).toBe(false)
    const after = commit.state.players[0]!
    expect(after.resources.wood).toBe(woodBefore)
    expect(after.stableTiles).toEqual([
      { row: 0, col: 4 },
      { row: 1, col: 4 },
    ])
    expect(after.cardStates?.B85_FarmHand?.extraData?.position).toBeUndefined()
  })
})
