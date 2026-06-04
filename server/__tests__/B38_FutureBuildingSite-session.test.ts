import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { computeScores , ScoreEntry } from '../../shared/domain/scoring'
import type { ActionChoiceOption,  FarmTilePosition } from '../../shared/contract/types'
import { positionKey } from '../../shared/domain/farm'

import { B38_FutureBuildingSite } from '../../shared/cards/B/B38_FutureBuildingSite'
import { meetsCardPrerequisites } from '../../shared/cards/helpers/prerequisites'

const CARD_ID = 'B38_FutureBuildingSite'

// Default 2-player layout: rooms at (2,0) and (1,0).
// Locked tiles (adjacent to rooms, but not rooms themselves): (0,0), (1,1), (2,1)
const DEFAULT_LOCKED: FarmTilePosition[] = [
  { row: 0, col: 0 },
  { row: 1, col: 1 },
  { row: 2, col: 1 },
]

// Deterministic setup: fixed seed + explicit non-card placeholder hands so the
// dealt-hand randomness from `new GameSession()` never leaks into the test.
// See the equivalent comment in `worker-identity-fg.test.ts` for the rationale.
const FILLER = '__test_filler__'

const setup = (opts: { withCard?: boolean; locked?: FarmTilePosition[] } = {}) => {
  const session = new GameSession(/* seed */ 1)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.currentPlayerIndex = 0

  for (const p of state.players) {
    p.minorHand = [FILLER]
    p.occupationHand = [FILLER]
  }

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
    // Independent setup (does NOT use the file-level setup helper because we want
    // B38 to be unplayed in hand at the start). Apply the same deterministic
    // hand-control as the file-level setup.
    const session = new GameSession(/* seed */ 1)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    state.round = 1

    for (const p of state.players) {
      p.minorHand = [FILLER]
      p.occupationHand = [FILLER]
    }
    state.players[0]!.minorHand = [CARD_ID]
    session.loadState(state)

    // meeting-place flow: seq[ set-first-player, optional(minor-improvement) ]
    // After takeAction the engine surfaces the optional metadata choice
    // (accept-execute / __skip__).
    let resp = session.takeAction(0, 'meeting-place')
    expect(resp.ok).toBe(true)
    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return

    // Sole choice surfaced: the optional host for `minor-improvement`
    // (accept-execute / __skip__). Because B38 is the only playable minor in the
    // player's hand, `minor-improvement.execute` short-circuits the per-card
    // choice and B38's onBuy runs immediately.
    const acceptMinor = resp.interaction.options?.find((o) => o.value !== '__skip__')
    expect(acceptMinor).toBeDefined()
    resp = session.resolveChoice(0, acceptMinor!.value)
    expect(resp.ok).toBe(true)

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

    // Try to directly plow a locked tile — plowAction.resolveChoice returns
    // fail, which surfaces as ok=false with pending cleared and no field added.
    const fieldsBefore = resp.state.players[0]!.fields.length
    resp = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.fields.length).toBe(fieldsBefore)
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

    resp = session.commitSelectionChoice(0, { tile })
    expect(resp.ok).toBe(true)
  })

  it('does not offer room building when locked tiles leave no reachable room', () => {
    const session = setup()

    const resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    expect(resp.interaction.stateId).toBe('wait')
    if (resp.interaction.stateId !== 'wait') return
    const roomOpt = resp.interaction.options?.find((o: ActionChoiceOption) =>
      o.labelKey === 'actions.construct.name',
    )
    expect(roomOpt).toBeUndefined()
  })

  it('stable on locked tile is rejected', () => {
    const session = setup()

    let resp = session.takeAction(0, 'farm-expansion')
    expect(resp.ok).toBe(true)

    // Select stable building (option value is `seq-stables-<n>`)
    if (resp.interaction.stateId === 'wait') {
      const stableOpt = resp.interaction.options?.find(
        (o: ActionChoiceOption) => o.labelKey === 'actions.stables.name',
      )
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

    // Try building stable on locked tile (0,0) — stablesAction.resolveChoice
    // returns fail, surfaced as ok=false with pending cleared and no stable
    // added.
    const stablesBefore = resp.state.players[0]!.stableTiles.length
    resp = session.commitSelectionChoice(0, { stables: [{ row: 0, col: 0 }] })
    expect(resp.ok).toBe(false)
    expect(resp.state.players[0]!.stableTiles.length).toBe(stablesBefore)
  })

  it('fence enclosing locked tile is rejected', () => {
    const session = setup()

    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Try to fence tile (0,0) which is locked
    // Edges around (0,0): H-0-0 (top), H-1-0 (bottom), V-0-0 (left), V-0-1 (right)
    resp = session.commitSelectionChoice(0, {
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
      player.fields.push({ row: tile.row, col: tile.col, stacks: [] })
    }

    session.loadState(state)

    // Now locked tiles should be unlocked — try to plow (0,0)
    // But (0,0) is a locked tile and all non-locked tiles are used, so it should be available
    let resp = session.takeAction(0, 'fencing')
    expect(resp.ok).toBe(true)

    // Try to fence locked tile (0,0) — should succeed now
    resp = session.commitSelectionChoice(0, {
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
      (e: ScoreEntry) => 'cardId' in e && e.cardId === CARD_ID,
    )
    expect(b38Entry).toBeDefined()
    expect(b38Entry!.score).toBe(3)
  })

  describe('prerequisite "Play in Round 4 or Before"', () => {
    it('blocks when round > 4', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.round = 5
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B38_FutureBuildingSite, state.round, state)).toBe(false)
    })

    it('allows when round <= 4', () => {
      const session = new GameSession()
      const state = session.getState().state
      state.round = 4
      const player = state.players[0]!
      expect(meetsCardPrerequisites(player, B38_FutureBuildingSite, state.round, state)).toBe(true)
    })
  })
})
