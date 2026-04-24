import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import type { CardListenerContext } from '../../shared/cards/card-listeners'
import {
  getRegisteredCardListeners,
  executeCardListener,
} from '../../shared/cards/card-listeners'
import {
  isCardFlagged,
  readCardExtraData,
  setCardFlag,
  writeCardExtraData,
} from '../../shared/cards/helpers/card-state'
import { getCardEffect } from '../../shared/cards/card-effects'
import { getExtraRoomCapacity } from '../../shared/cards/card-effects'
import { getFarmHandCandidates } from '../../shared/cards/B/B85_FarmHand'

import '../../shared/cards/B/B85_FarmHand'
import type { ActionSpace, FarmTilePosition, GameState, PlayerState } from '../../shared/game/types'

const CARD_ID = 'B85_FarmHand'
const LISTENER_ID = 'B85-farm-hand-anytime'

const getListener = (id: string) =>
  getRegisteredCardListeners().find((l) => l.id === id)!

const make2x2Fields = (): FarmTilePosition[] => [
  { row: 0, col: 2 },
  { row: 0, col: 3 },
  { row: 1, col: 2 },
  { row: 1, col: 3 },
]

const setupPlayer = (overrides: Partial<PlayerState> = {}): PlayerState => {
  const session = new GameSession()
  const state = session.getState().state
  const p = state.players[0]!
  p.occupationPlayed.push(CARD_ID)
  p.resources.wood = 5
  p.resources.food = 10
  p.fields = make2x2Fields().map((t) => ({ ...t, stacks: [] }))
  return { ...p, ...overrides }
}

const buildContext = (
  player: PlayerState,
  space: Partial<ActionSpace> & { id: string },
): CardListenerContext => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = [player]
  return {
    state: state as GameState,
    player,
    space: { nameKey: '', descriptionKey: '', roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }), resources: {} as never, takenBy: [], ...space } as ActionSpace,
    actionId: space.id,
    phase: 'anytime',
  }
}

describe('B85_FarmHand — anytime guard', () => {
  it('offers to build FarmHand when inside `stables` with a valid 2×2 + wood', () => {
    const player = setupPlayer()
    const ctx = buildContext(player, { id: 'stables' })
    const result = executeCardListener(getListener(LISTENER_ID), ctx)
    expect(result?.flow).toBeDefined()
  })

  it('refuses outside `stables` (e.g. in farm-expansion top level, forest, etc.)', () => {
    const player = setupPlayer()
    for (const spaceId of ['forest', 'farm-expansion', 'construct', 'play-occupation']) {
      const ctx = buildContext(player, { id: spaceId })
      const result = executeCardListener(getListener(LISTENER_ID), ctx)
      expect(result).toBeUndefined()
    }
  })

  it('refuses without a 2×2 field block', () => {
    const player = setupPlayer()
    // Remove one corner so no 2x2 exists.
    player.fields = player.fields.slice(0, 3)
    const ctx = buildContext(player, { id: 'stables' })
    expect(executeCardListener(getListener(LISTENER_ID), ctx)).toBeUndefined()
  })

  it('refuses without 1 wood', () => {
    const player = setupPlayer()
    player.resources.wood = 0
    const ctx = buildContext(player, { id: 'stables' })
    expect(executeCardListener(getListener(LISTENER_ID), ctx)).toBeUndefined()
  })

  it('refuses after once-per-game use (flagged)', () => {
    const player = setupPlayer()
    setCardFlag(player, CARD_ID, true)
    const ctx = buildContext(player, { id: 'stables' })
    expect(executeCardListener(getListener(LISTENER_ID), ctx)).toBeUndefined()
  })
})

describe('B85_FarmHand — housing contribution', () => {
  it('adds +1 housing via computeExtraRoomCapacity once position is set', () => {
    const player = setupPlayer()
    expect(getExtraRoomCapacity(player)).toBe(0)
    writeCardExtraData(player, CARD_ID, 'position', { row: 0, col: 2 })
    expect(getExtraRoomCapacity(player)).toBe(1)
  })

  it('drops back to 0 after the position is cleared', () => {
    const player = setupPlayer()
    writeCardExtraData(player, CARD_ID, 'position', { row: 0, col: 2 })
    expect(getExtraRoomCapacity(player)).toBe(1)
    delete player.cardStates![CARD_ID]!.extraData!.position
    expect(getExtraRoomCapacity(player)).toBe(0)
  })

  it('once-per-game flag stays true after position is cleared (blocks second build)', () => {
    const player = setupPlayer()
    setCardFlag(player, CARD_ID, true)
    writeCardExtraData(player, CARD_ID, 'position', { row: 0, col: 2 })
    // Sample-Stable-Maker-style return: clear position only.
    delete player.cardStates![CARD_ID]!.extraData!.position
    expect(isCardFlagged(player, CARD_ID)).toBe(true)
    // Listener still refuses — card is "used" for the whole game.
    const ctx = buildContext(player, { id: 'stables' })
    expect(executeCardListener(getListener(LISTENER_ID), ctx)).toBeUndefined()
  })
})

describe('B85_FarmHand — candidate detection', () => {
  it('returns all valid 2x2 top-left positions', () => {
    const p = setupPlayer()
    p.fields = [
      { row: 0, col: 2, stacks: [] },
      { row: 0, col: 3, stacks: [] },
      { row: 1, col: 2, stacks: [] },
      { row: 1, col: 3, stacks: [] },
    ] as PlayerState['fields']
    expect(getFarmHandCandidates(p)).toEqual([{ row: 0, col: 2 }])
  })

  it('returns no candidates when the four tiles do not form a contiguous 2x2', () => {
    const p = setupPlayer()
    p.fields = [
      { row: 0, col: 0, stacks: [] },
      { row: 0, col: 2, stacks: [] },
      { row: 2, col: 0, stacks: [] },
      { row: 2, col: 2, stacks: [] },
    ] as PlayerState['fields']
    expect(getFarmHandCandidates(p)).toEqual([])
  })
})

// Silence unused-import warnings when eslint runs on this file.
void readCardExtraData
void getCardEffect
