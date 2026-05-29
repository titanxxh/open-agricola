import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { FarmTilePosition, PlayerState } from '../../shared/contract/types'
import { getAvailableStableSupplyCount } from '../../shared/domain/supply-tokens'
import {
  computeAnimalZones,
  getLooseStableKeys,
  getTotalAnimalCapacity,
} from '../../shared/domain/animal-zones'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import {
  getFarmHandCandidates,
  getFarmHandStablePositions,
  readFarmHandPosition,
} from '../../shared/cards/B/B85_FarmHand'
import { positionKey } from '../../shared/domain/farm'
import { playerBoard } from '../../shared/domain'
import type { GameEvent } from '../../shared/contract/events'

import '../../shared/cards/B/B85_FarmHand'

const CARD_ID = 'B85_FarmHand'

const PLACEHOLDER = ['__test_placeholder__']

const make2x2Fields = (): FarmTilePosition[] => [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
]

const FARM_HAND_TILE: FarmTilePosition = { row: 0, col: 2 }

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
  player.resources = { ...player.resources, wood: 10, food: 10, reed: 2 }
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

const findStableBuiltStables = (events: readonly GameEvent[]) =>
  events
    .filter((event): event is Extract<GameEvent, { type: 'farm.stableBuilt' }> =>
      event.type === 'farm.stableBuilt',
    )
    .flatMap((event) => event.stables)

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
    expect(candidates).toEqual([FARM_HAND_TILE])

    const before = getAvailableStableSupplyCount(resp.state, resp.state.players[0]!)
    const woodBefore = resp.state.players[0]!.resources.wood

    const commit = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    expect(after.resources.wood).toBe(woodBefore - 2)
    expect(after.cardStates?.[CARD_ID]?.extraData?.position).toEqual(FARM_HAND_TILE)
    expect(after.cardStates?.[CARD_ID]?.flagged).toBe(true)
    expect(after.stableTiles.length).toBe(0)
    expect(getAvailableStableSupplyCount(commit.state, after)).toBe(before - 1)
  })

  it('emits a special farm.stableBuilt item tagged with the source card', () => {
    const session = setupBuildStables()
    enterStableSelect(session)
    const commit = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(commit.ok).toBe(true)

    const stables = findStableBuiltStables(commit.state.events)
    expect(stables).toEqual([
      {
        playerId: commit.state.players[0]!.id,
        row: FARM_HAND_TILE.row,
        col: FARM_HAND_TILE.col,
        kind: 'special',
        sourceCardId: CARD_ID,
      },
    ])
  })

  it('builds an ordinary stable as kind=normal without a source card', () => {
    const session = setupBuildStables({
      occupationPlayed: [],
      fields: [{ row: 0, col: 2, stacks: [] }],
    } as Partial<PlayerState>)
    const resp = enterStableSelect(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const farm = resp.interaction.farm
    expect(farm?.farmType).toBe('stable')
    if (farm?.farmType !== 'stable') return
    expect(farm.farmHandPositions).toBeUndefined()

    const target = farm.selectableTiles?.[0]
    expect(target).toBeDefined()
    const commit = session.commitSelectionChoice(0, { stables: [target!] })
    expect(commit.ok).toBe(true)

    const stables = findStableBuiltStables(commit.state.events)
    expect(stables).toEqual([
      {
        playerId: commit.state.players[0]!.id,
        row: target!.row,
        col: target!.col,
        kind: 'normal',
      },
    ])
  })

  it('does not place the FarmHand stable in any animal zone or loose stable capacity', () => {
    const session = setupBuildStables()
    enterStableSelect(session)
    const commit = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(commit.ok).toBe(true)

    const after = commit.state.players[0]!
    const farmHandKey = positionKey(FARM_HAND_TILE)
    expect(after.stableTiles.length).toBe(0)
    expect(getLooseStableKeys(after)).not.toContain(farmHandKey)
    const zones = computeAnimalZones(after, commit.state)
    expect(zones.map((zone) => zone.id)).not.toContain(`stable:${farmHandKey}`)
    expect(getTotalAnimalCapacity(after, commit.state)).toBe(1)
    expect(getExtraRoomCapacity(after)).toBe(1)
  })

  it('rejects a submission that reuses the FarmHand tile as an ordinary stable', () => {
    const session = setupBuildStables()
    enterStableSelect(session)
    const commit = session.commitSelectionChoice(0, {
      stables: [FARM_HAND_TILE],
      farmHand: FARM_HAND_TILE,
    })
    expect(commit.ok).toBe(false)
    expect(commit.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBeFalsy()
    expect(readFarmHandPosition(commit.state.players[0]!)).toBeUndefined()
  })

  it('rejects a FarmHand position that is not the centre of a 2×2 field block', () => {
    const session = setupBuildStables()
    enterStableSelect(session)
    const commit = session.commitSelectionChoice(0, { farmHand: { row: 2, col: 0 } })
    expect(commit.ok).toBe(false)
    expect(commit.state.players[0]!.cardStates?.[CARD_ID]?.flagged).toBeFalsy()
    expect(readFarmHandPosition(commit.state.players[0]!)).toBeUndefined()
  })

  it('offers no further FarmHand position once the card is used (flagged)', () => {
    const session = setupBuildStables()
    enterStableSelect(session)
    const first = session.commitSelectionChoice(0, { farmHand: FARM_HAND_TILE })
    expect(first.ok).toBe(true)

    const after = first.state.players[0]!
    expect(after.cardStates?.[CARD_ID]?.flagged).toBe(true)
    expect(getFarmHandStablePositions(first.state, after)).toEqual([])
  })

  it('exposes farmHandPositions only through the farm-expansion entry, not the base stable selection', () => {
    const session = setupBuildStables()
    const resp = enterStableSelect(session)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const farm = resp.interaction.farm
    expect(farm?.farmType).toBe('stable')
    if (farm?.farmType !== 'stable') return
    expect(farm.farmHandPositions).toEqual([FARM_HAND_TILE])

    const baseSelection = playerBoard(resp.state, 0).farmyard.selectableTiles('stable', {})
    expect(
      (baseSelection as { farmHandPositions?: unknown }).farmHandPositions,
    ).toBeUndefined()
  })
})

describe('B85 FarmHand — candidate detection', () => {
  it('returns the top-left of a contiguous 2×2 field block', () => {
    const player = setupBuildStables().getState().state.players[0]!
    expect(getFarmHandCandidates(player)).toEqual([FARM_HAND_TILE])
  })

  it('returns no candidate when the four field tiles are not a contiguous 2×2', () => {
    const session = setupBuildStables({
      fields: [
        { row: 0, col: 0, stacks: [] },
        { row: 0, col: 2, stacks: [] },
        { row: 2, col: 0, stacks: [] },
        { row: 2, col: 2, stacks: [] },
      ],
    } as Partial<PlayerState>)
    const player = session.getState().state.players[0]!
    expect(getFarmHandCandidates(player)).toEqual([])
  })
})
