import { describe, expect, it } from 'vitest'
import { GameSession } from '../game-session'
import { computeScores } from '../../shared/logic/scoring'
import type { FarmTilePosition } from '../../shared/game/types'
import { positionKey } from '../../shared/game/farm'

import { B38_FutureBuildingSite } from '../../shared/cards/B/B38_FutureBuildingSite'

const CARD_ID = 'B38_FutureBuildingSite'

// Default 2-player layout: rooms at (2,0) and (1,0).
// Locked tiles (adjacent to rooms, but not rooms themselves): (0,0), (1,1), (2,1)
const DEFAULT_LOCKED: FarmTilePosition[] = [
  { row: 0, col: 0 },
  { row: 1, col: 1 },
  { row: 2, col: 1 },
]

const setup = (opts: { withCard?: boolean; locked?: FarmTilePosition[] } = {}) => {
  const session = new GameSession()
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  const player = state.players[0]!
  player.resources = {
    ...player.resources,
    wood: 20,
    clay: 20,
    reed: 20,
    stone: 20,
    food: 20,
  }

  if (opts.withCard !== false) {
    player.minorPlayed.push(CARD_ID)
    if (!player.cardStates) player.cardStates = {}
    player.cardStates[CARD_ID] = {
      extraData: { locked: opts.locked ?? DEFAULT_LOCKED },
    }
  }

  session.loadState(state)
  return session
}

const vpForCards = (session: GameSession) => {
  const state = session.getState().state
  const scores = computeScores(state)
  const summary = scores.find((s) => s.playerId === state.players[0]!.id)!
  return summary.categories.find((c) => c.key === 'cards')?.total ?? 0
}

describe('B38 FutureBuildingSite — session', () => {
  it('card has vp=3 and maxRound=4', () => {
    expect(B38_FutureBuildingSite.vp).toBe(3)
    expect(B38_FutureBuildingSite.maxRound).toBe(4)
  })

  it('onBuy computes correct locked tiles for default 2-player layout', () => {
    const session = new GameSession()
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    const player = state.players[0]!
    player.minorHand.push(CARD_ID)
    session.loadState(state)

    // Use the meeting-place action to play the minor improvement
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.pending.type).toBe('choice')

    // Navigate through the meeting-place flow
    // First choice might be skip/play improvement
    let foundCard = false
    for (let i = 0; i < 5 && resp.pending.type === 'choice'; i++) {
      const options = resp.pending.options?.map((o: any) => o.value) ?? []
      const cardChoice = options.find((v: string) => v.includes(CARD_ID))
      if (cardChoice) {
        resp = session.resolveChoice(0, cardChoice)
        expect(resp.ok).toBe(true)
        foundCard = true
        break
      }
      // If there's a non-skip option, choose it to advance
      const nonSkip = options.find((v: string) => v !== '__skip__')
      if (nonSkip) {
        resp = session.resolveChoice(0, nonSkip)
      } else {
        break
      }
    }
    expect(foundCard).toBe(true)

    // After buying, check locked tiles in cardStates
    const p0 = resp.state.players[0]!
    expect(p0.minorPlayed).toContain(CARD_ID)
    const cardState = p0.cardStates?.[CARD_ID]
    expect(cardState).toBeDefined()
    const locked = cardState?.extraData?.locked as FarmTilePosition[]
    expect(locked).toBeDefined()
    expect(locked).toHaveLength(3)
    const lockedKeys = new Set(locked.map(positionKey))
    expect(lockedKeys.has('0-0')).toBe(true)
    expect(lockedKeys.has('1-1')).toBe(true)
    expect(lockedKeys.has('2-1')).toBe(true)
  })

  it('plow on locked tile is rejected', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // Locked tile (0,0) should NOT be in selectable tiles
    const selectableTiles = resp.interaction.farm.selectableTiles
    const lockedKeys = new Set(DEFAULT_LOCKED.map(positionKey))
    const selectableKeys = new Set(selectableTiles.map(positionKey))
    for (const lk of lockedKeys) {
      expect(selectableKeys.has(lk)).toBe(false)
    }

    // Try to directly plow a locked tile — should fail
    resp = session.commitFarmChoice(0, 'plow', { tile: { row: 0, col: 0 } })
    expect(resp.ok).toBe(false)
  })

  it('plow on non-locked free tile is allowed', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farmland')
    expect(resp.ok).toBe(true)

    // (0,1) is free and not locked
    const tile = { row: 0, col: 1 }
    const selectableTiles = resp.interaction.farm.selectableTiles
    const selectableKeys = new Set(selectableTiles.map(positionKey))
    expect(selectableKeys.has(positionKey(tile))).toBe(true)

    resp = session.commitFarmChoice(0, 'plow', { tile })
    expect(resp.ok).toBe(true)
  })

  it('room on locked tile is rejected', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    // Select room building
    if (resp.pending.type === 'choice') {
      const roomOpt = resp.pending.options?.find((o: any) => o.value === 'construct')
      if (roomOpt) {
        resp = session.resolveChoice(0, roomOpt.value)
      }
    }

    // Locked tiles should not be in selectable tiles for room
    if (resp.interaction?.farm?.selectableTiles) {
      const selectableKeys = new Set(resp.interaction.farm.selectableTiles.map(positionKey))
      for (const lt of DEFAULT_LOCKED) {
        expect(selectableKeys.has(positionKey(lt))).toBe(false)
      }
    }

    // Try building room on locked tile (2,1) — should fail
    resp = session.commitFarmChoice(0, 'room', { rooms: [{ row: 2, col: 1 }] })
    expect(resp.ok).toBe(false)
  })

  it('stable on locked tile is rejected', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    // Select stable building
    if (resp.pending.type === 'choice') {
      const stableOpt = resp.pending.options?.find((o: any) => o.value === 'stables')
      if (stableOpt) {
        resp = session.resolveChoice(0, stableOpt.value)
      }
    }

    // Locked tiles should not be in selectable tiles for stable
    if (resp.interaction?.farm?.selectableTiles) {
      const selectableKeys = new Set(resp.interaction.farm.selectableTiles.map(positionKey))
      for (const lt of DEFAULT_LOCKED) {
        expect(selectableKeys.has(positionKey(lt))).toBe(false)
      }
    }

    // Try building stable on locked tile (0,0) — should fail
    resp = session.commitFarmChoice(0, 'stable', { stables: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(false)
  })

  it('fence enclosing locked tile is rejected', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Try to fence tile (0,0) which is locked
    // Edges around (0,0): H-0-0 (top), H-1-0 (bottom), V-0-0 (left), V-0-1 (right)
    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(false)
  })

  it('unlocks tiles when all non-locked free tiles are filled', () => {
    const session = setup()
    const state = session.getState().state
    const player = state.players[0]!

    // Fill all non-locked tiles except the locked ones.
    // Grid is 3x5 = 15 tiles.
    // Rooms: (2,0), (1,0) — 2 tiles
    // Locked: (0,0), (1,1), (2,1) — 3 tiles
    // Non-locked free: 15 - 2 - 3 = 10 tiles
    // Fill them all with fields and stables
    const allTiles = [] as FarmTilePosition[]
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        allTiles.push({ row, col })
      }
    }
    const roomKeys = new Set(['2-0', '1-0'])
    const lockedKeys = new Set(DEFAULT_LOCKED.map(positionKey))
    const nonLockedFree = allTiles.filter((t) => {
      const key = positionKey(t)
      return !roomKeys.has(key) && !lockedKeys.has(key)
    })

    // Place fields on all non-locked free tiles
    for (const tile of nonLockedFree) {
      player.fields.push({ row: tile.row, col: tile.col, crop: null, quantity: 0 })
    }

    session.loadState(state)

    // Now locked tiles should be unlocked — try to plow (0,0)
    // But (0,0) is a locked tile and all non-locked tiles are used, so it should be available
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Try to fence locked tile (0,0) — should succeed now
    resp = session.commitFarmChoice(0, 'fence', {
      edges: ['H-0-0', 'H-1-0', 'V-0-0', 'V-0-1'],
      palisadeEdges: [],
      extraWood: 0,
    })
    expect(resp.ok).toBe(true)
  })

  it('scores 3 VP from card vp field', () => {
    const session = setup()

    // The card's vp=3 is automatically counted in the 'cards' scoring category
    const vp = vpForCards(session)
    // vp includes the 3 from B38, there could be other minor cards with 0 vp
    expect(vp).toBeGreaterThanOrEqual(3)

    // More precisely, check the entry
    const state = session.getState().state
    const scores = computeScores(state)
    const summary = scores.find((s) => s.playerId === state.players[0]!.id)!
    const cardsCat = summary.categories.find((c) => c.key === 'cards')!
    const b38Entry = cardsCat.entries.find(
      (e: any) => e.cardId === CARD_ID,
    )
    expect(b38Entry).toBeDefined()
    expect(b38Entry!.score).toBe(3)
  })
})
