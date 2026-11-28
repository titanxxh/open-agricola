import { afterEach, describe, expect, it } from 'vitest'
import { CWM062_BackyardWell } from '../../shared/cards/classic/CWM/CWM062_BackyardWell'
import { CWM081_FishPond } from '../../shared/cards/classic/CWM/CWM081_FishPond'
import type { GameState } from '../../shared/contract/types'
import { getFarmyardTilePositions } from '../../shared/domain/farm'
import { markAllWorkersUsed, setWorkersAtHome } from '../../shared/domain/player'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { playMinor, sessionOptions } from './_helpers/card-regression-session'
import { confirmTurns } from './_helpers/classic-fl'
import { createWorkSession } from './_helpers/session-fixtures'

const BACKYARD_WELL = 'CWM062_BackyardWell'
const FISH_POND = 'CWM081_FishPond'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach((session) => session.dispose()))

function setup(round: number, configure: (state: GameState) => void) {
  const session = createWorkSession({
    seed: 6281,
    configure: (state) => {
      state.round = round
      for (const player of state.players) {
        player.resources.food = 10
        setWorkersAtHome(state, player, 2)
      }
      configure(state)
    },
  })
  sessions.push(session)
  return session
}

function cardBonusScore(resp: SessionResponse, cardId: string): number {
  const entries = resp.scores?.[0]?.categories.find((c) => c.key === 'cardBonusVp')?.entries ?? []
  return entries
    .filter((e) => 'cardId' in e && e.cardId === cardId)
    .reduce((sum, e) => sum + e.score, 0)
}

describe('CWM062_BackyardWell & CWM081_FishPond session', () => {
  it('CWM062_BackyardWell costs 2 stone + 1 wood for 2 VP, places 1 stone adjacent to home once per game, blocks that tile, and delivers food on the next 3 rounds', () => {
    expect(CWM062_BackyardWell.meta.cost).toEqual({ stone: 2, wood: 1 })
    expect(CWM062_BackyardWell.meta.vp).toBe(2)

    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [BACKYARD_WELL]
      Object.assign(p0.resources, { stone: 2, wood: 1, food: 5 })
    })

    const bought = playMinor(session, BACKYARD_WELL)
    expect(bought.ok, bought.error).toBe(true)
    expect(bought.state.players[0]!.resources).toMatchObject({ stone: 0, wood: 0, food: 5 })
    const printedVpEntries = bought.scores?.[0]?.categories.find((c) => c.key === 'cards')?.entries ?? []
    expect(printedVpEntries).toContainEqual(
      expect.objectContaining({ type: 'card', cardId: BACKYARD_WELL, score: 2 }),
    )

    const anytime = bought.interaction.anytimeActions.find((a) => a.sourceCard === BACKYARD_WELL)!
    expect(anytime).toBeDefined()
    const selectTile = session.takeAnytimeAction(0, anytime.id)
    expect(selectTile.ok, selectTile.error).toBe(true)

    // Non-adjacent tile (0, 4) must be rejected without mutating state:
    const badTile = session.commitSelectionChoice(0, { positions: ['0-4'] })
    expect(badTile.ok).toBe(false)
    expect(badTile.state.players[0]!.farmyardSpaceStates ?? []).toHaveLength(0)

    // Orthogonally adjacent tile (0, 0) (above room (1, 0)) succeeds:
    const placed = session.commitSelectionChoice(0, { positions: ['0-0'] })
    expect(placed.ok, placed.error).toBe(true)
    expect(placed.state.players[0]!.farmyardSpaceStates).toContainEqual(
      expect.objectContaining({
        spaceKey: '0-0',
        sourceCardId: BACKYARD_WELL,
        resources: { stone: 1 },
        blocksPlacement: true,
      }),
    )
    expect(
      placed.state.futureMeeples
        .filter((m) => m.cardId === BACKYARD_WELL && m.playerId === placed.state.players[0]!.id)
        .map((m) => ({ round: m.round, resources: m.resources })),
    ).toEqual([
      { round: 2, resources: { food: 1 } },
      { round: 3, resources: { food: 1 } },
      { round: 4, resources: { food: 1 } },
    ])
    expect(placed.state.players[0]!.cardStates[BACKYARD_WELL]?.flagged).toBe(true)
    expect(placed.interaction.anytimeActions.some((a) => a.sourceCard === BACKYARD_WELL)).toBe(false)
    expect(placed.state.log.length).toBeGreaterThan(0)

    // Tile (0, 0) now counts as used -> cannot be plowed on Farmland!
    confirmTurns(session, placed)
    confirmTurns(session, session.takeAction(1, 'day-laborer'))
    session.takeAction(0, 'farmland')
    const blockedPlow = session.commitSelectionChoice(0, { tile: { row: 0, col: 0 } })
    expect(blockedPlow.ok).toBe(false)
    const legalPlow = session.commitSelectionChoice(0, { tile: { row: 0, col: 2 } })
    expect(legalPlow.ok, legalPlow.error).toBe(true)
    confirmTurns(session, legalPlow)

    // Advance to start of Round 2 -> player 0 receives 1 scheduled food (5 -> 6):
    for (const p of session.state.players) markAllWorkersUsed(session.state, p)
    const round2 = session.performRoundEnd()
    expect(round2.ok, round2.error).toBe(true)
    expect(round2.state.round).toBe(2)
    expect(round2.state.players[0]!.resources.food).toBe(6)
  })

  it('CWM081_FishPond costs 1 clay, requires 1 unused space, scores -1 at 0 food, caps Fishing deposits to space food, and scores +2/+4 at 4/8 food', () => {
    expect(CWM081_FishPond.meta.cost).toEqual({ clay: 1 })

    // Negative prerequisite: 0 unused spaces blocks playing Fish Pond!
    const fullFarm = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [FISH_POND]
      p0.resources.clay = 1
      const roomKeys = new Set(p0.roomTiles.map((r) => `${r.row}-${r.col}`))
      p0.fields = getFarmyardTilePositions(p0)
        .filter((t) => !roomKeys.has(`${t.row}-${t.col}`))
        .map((t) => ({ row: t.row, col: t.col, stacks: [] }))
    })
    const fullMeeting = fullFarm.takeAction(0, 'meeting-place')
    expect(fullMeeting.interaction.request.kind).toBe('confirm-next-player')

    // Positive: play Fish Pond for 1 clay, place clay marker at (0, 4), verify -1 bonus VP at 0 food:
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorHand = [FISH_POND]
      Object.assign(p0.resources, { clay: 1, food: 5 })
      state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 4
    })

    const chooseTile = playMinor(session, FISH_POND)
    expect(chooseTile.ok, chooseTile.error).toBe(true)
    const afterPlace = session.commitSelectionChoice(0, { positions: ['0-4'] })
    expect(afterPlace.ok, afterPlace.error).toBe(true)
    expect(afterPlace.state.players[0]!.resources.clay).toBe(0)
    expect(afterPlace.state.players[0]!.farmyardSpaceStates).toContainEqual(
      expect.objectContaining({
        spaceKey: '0-4',
        sourceCardId: FISH_POND,
        resources: { clay: 1 },
        blocksPlacement: true,
      }),
    )
    expect(cardBonusScore(afterPlace, FISH_POND)).toBe(-1)

    confirmTurns(session, afterPlace)
    confirmTurns(session, session.takeAction(1, 'day-laborer'))

    // Non-Fishing food action (Day Laborer) does NOT trigger Fish Pond:
    session.state.actionSpaces.find((s) => s.id === 'day-laborer')!.takenBy = []
    const dayLab = session.takeAction(0, 'day-laborer')
    expect(dayLab.interaction.request.kind).toBe('confirm-next-player')
    session.undoAction(0)

    // Visit Fishing (4 food on space, 5 already in supply = 9 total): options must cap at 4 food (NOT 5..9), plus __skip__!
    const fish1 = session.takeAction(0, 'fishing')
    expect(fish1.ok, fish1.error).toBe(true)
    const storeOpts = sessionOptions(fish1)
    expect(storeOpts.some((o) => o.value === '__skip__')).toBe(true)
    const paidAmounts = storeOpts.flatMap((o) =>
      o.effectPreview?.kind === 'payment' && typeof o.effectPreview.resourcesPaid.food === 'number'
        ? [o.effectPreview.resourcesPaid.food]
        : [],
    )
    expect(paidAmounts.sort((a, b) => a - b)).toEqual([1, 2, 3, 4])

    const storeFour = storeOpts.find(
      (o) => o.effectPreview?.kind === 'payment' && o.effectPreview.resourcesPaid.food === 4,
    )!
    const afterStore4 = session.resolveChoice(0, storeFour.value)
    expect(afterStore4.ok, afterStore4.error).toBe(true)
    expect(afterStore4.state.players[0]!.resources.food).toBe(5)
    expect(afterStore4.state.players[0]!.cardStates[FISH_POND]?.counters?.food).toBe(4)
    expect(cardBonusScore(afterStore4, FISH_POND)).toBe(2)

    // Advance naturally to Round 2, restock Fishing to 4 food, and store 4 more -> 8 food = +4 bonus VP!
    confirmTurns(session, afterStore4)
    for (const p of session.state.players) markAllWorkersUsed(session.state, p)
    const r2 = session.performRoundEnd()
    expect(r2.ok, r2.error).toBe(true)
    session.state.actionSpaces.find((s) => s.id === 'fishing')!.resources.food = 4

    const fish2 = session.takeAction(0, 'fishing')
    expect(fish2.ok, fish2.error).toBe(true)
    const storeFourAgain = sessionOptions(fish2).find(
      (o) => o.effectPreview?.kind === 'payment' && o.effectPreview.resourcesPaid.food === 4,
    )!
    const afterStore8 = session.resolveChoice(0, storeFourAgain.value)
    expect(afterStore8.ok, afterStore8.error).toBe(true)
    expect(afterStore8.state.players[0]!.cardStates[FISH_POND]?.counters?.food).toBe(8)
    expect(cardBonusScore(afterStore8, FISH_POND)).toBe(4)
  })

  it('wires Backyard Well wellIdentity into Storage Barn (+1 stone) without counting as Major Well for Water Gully', () => {
    const session = setup(1, (state) => {
      const p0 = state.players[0]!
      p0.minorPlayed = [BACKYARD_WELL]
      p0.minorHand = ['A006_StorageBarn', 'E042_WaterGully', FISH_POND]
      Object.assign(p0.resources, { stone: 1, clay: 1 })
    })

    let meeting = session.takeAction(0, 'meeting-place')
    const branch = sessionOptions(meeting).find((o) => o.value.startsWith('action-improvement-'))
    if (branch) {
      meeting = session.resolveChoice(0, branch.value)
    }
    const minorOptions = sessionOptions(meeting)
    expect(minorOptions.some((o) => o.value === 'A006_StorageBarn')).toBe(true)
    // E042_WaterGully explicitly requires "Major Well", so minor Backyard Well does not unlock it:
    expect(minorOptions.some((o) => o.value === 'E042_WaterGully')).toBe(false)

    const playedBarn = session.resolveChoice(0, 'A006_StorageBarn')
    expect(playedBarn.ok, playedBarn.error).toBe(true)
    // A006_StorageBarn is a passing minor (passes to player 1's hand) and awards 1 stone from Backyard Well's wellIdentity:
    expect(playedBarn.state.players[1]!.minorHand).toContain('A006_StorageBarn')
    expect(playedBarn.state.players[0]!.resources.stone).toBe(2)
  })
})
