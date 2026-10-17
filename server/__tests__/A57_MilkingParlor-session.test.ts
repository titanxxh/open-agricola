import { describe, expect, it, afterEach } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getAllTilePositions } from '../../shared/domain/farm'
import { setWorkersAtHome } from '../../shared/domain/player'

import '../../shared/cards/A/A057_MilkingParlor'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged, assertUndoRestored, undoRuleSnapshot } from './_helpers/negative-rule-audit'
import * as audit08Income from './_helpers/audit/ae-negative-08-income'

const CARD_ID = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'

const setup = ({
  sheep = 0,
  cattle = 0,
  unused = 4,
}: {
  sheep?: number
  cattle?: number
  unused?: number
} = {}) => {
  const session = new GameSession(5057, undefined, { playerCount: 2 })
  stabilizeRandomHands(session.state.players)
  const state = session.getState().state
  state.currentPlayerIndex = 0
  state.roundPhase = 'work'
  const player = state.players[0]!
  setWorkersAtHome(state, player, 2)
  player.minorHand = [CARD_ID]
  player.occupationHand = [FILLER]
  player.resources = {
    ...player.resources,
    wood: 2,
    food: 0,
    sheep,
    cattle,
  }
  const pastureTiles = [
    { row: 0, col: 1 }, { row: 0, col: 2 },
    { row: 1, col: 1 }, { row: 1, col: 2 },
  ]
  const pastureKeys = new Set(pastureTiles.map((tile) => `${tile.row}-${tile.col}`))
  player.roomTiles = getAllTilePositions()
    .filter((tile) => !pastureKeys.has(`${tile.row}-${tile.col}`))
    .slice(0, 11 - unused)
  player.rooms = player.roomTiles.length
  player.fields = []
  player.stableTiles = [{ row: 0, col: 1 }]
  player.pastures = [
    { id: 'sheep', tiles: pastureTiles.slice(0, 2), size: 2, stables: 1, animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep },
    { id: 'cattle', tiles: pastureTiles.slice(2), size: 2, stables: 0, animalType: cattle > 0 ? 'cattle' : null, animalCount: cattle },
  ]

  const opponent = state.players[1]!
  setWorkersAtHome(state, opponent, 2)
  opponent.minorHand = [FILLER]
  opponent.occupationHand = [FILLER]
  state.actionSpaces.find((space) => space.id === 'major-improvement')!.takenBy = []
  session.loadState(state)
  return session
}

const play = (session: GameSession): SessionResponse => {
  let response = session.takeAction(0, 'major-improvement')
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  if (response.interaction.stateId !== 'wait') return response
  const enter = response.interaction.request.options?.find((option) => {
    return option.value.startsWith('action-improvement-')
  })
  if (enter) response = session.resolveChoice(0, enter.value)
  if (response.interaction.stateId !== 'wait') return response
  const option = response.interaction.request.options?.find((candidate) => candidate.value === CARD_ID)
  if (!option) return response
  return session.resolveChoice(0, option.value)
}

describe('A057 Milking Parlor parity', () => {
  it('A057 S1: exactly four unused spaces allow paying two wood to play Milking Parlor', () => {
    const response = play(setup({ unused: 4 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources).toMatchObject({ wood: 0, food: 0 })
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A057 S2: sheep and cattle independently use every printed food threshold', () => {
    const cases = [
      { sheep: 0, cattle: 0, food: 0 },
      { sheep: 1, cattle: 0, food: 2 },
      { sheep: 2, cattle: 0, food: 2 },
      { sheep: 3, cattle: 0, food: 3 },
      { sheep: 4, cattle: 0, food: 4 },
      { sheep: 0, cattle: 1, food: 2 },
      { sheep: 0, cattle: 2, food: 3 },
      { sheep: 0, cattle: 3, food: 4 },
    ]

    cases.forEach((entry) => {
      const response = play(setup(entry))
      expect(response.ok, response.error).toBe(true)
      expect(
        response.state.players[0]!.resources.food,
        `${entry.sheep} sheep and ${entry.cattle} cattle`,
      ).toBe(entry.food)
    })
  })

  it('A057 S3: sheep and cattle rewards add together and cap at the printed maxima', () => {
    const response = play(setup({ sheep: 5, cattle: 4 }))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.food).toBe(8)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A057 S4: fewer than four unused spaces keep Milking Parlor unavailable without payment', () => {
    const response = play(setup({ sheep: 4, cattle: 3, unused: 3 }))

    expect(response.state.players[0]!.resources).toMatchObject({ wood: 2, food: 0 })
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
    expect(response.state.players[0]!.minorPlayed).not.toContain(CARD_ID)
  })
})

describe('ae-negative-08-income', () => {
  const { PARLOR, sessions, buy, deny, ready, turn, food, parlor, printed, cookSheep } = audit08Income
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()))
  it('A057 N1 actual Milking Parlor purchase needs two wood and four distinct unused farm spaces', () => {
    deny(parlor({ wood: 1 }), PARLOR); deny(parlor({ unused: 3 }), PARLOR); const r = buy(parlor(), PARLOR); assert.equal(r.state.players[0]!.resources.wood, 0); assert.equal(printed(r), 1); assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it('A057 N2 legally housed sheep thresholds include intervening two and over four cap', () => {
    for (const [sheep, bonus] of [[0, 0], [1, 2], [2, 2], [3, 3], [4, 4], [5, 4]] satisfies Array<[number, number]>) { const r = buy(parlor({ sheep }), PARLOR); assert.equal(r.state.players[0]!.resources.food, 40 + bonus); assert.equal(printed(r), 1) }
  })
  it('A057 N3 legally housed cattle thresholds include over three cap', () => {
    for (const [cattle, bonus] of [[0, 0], [1, 2], [2, 3], [3, 4], [4, 4]] satisfies Array<[number, number]>) { const r = buy(parlor({ cattle }), PARLOR); assert.equal(r.state.players[0]!.resources.food, 40 + bonus); assert.equal(printed(r), 1) }
  })
  it('A057 N4 combined sheep and cattle bonus is immediate and later real cooking cannot claw it back', () => {
    const s = parlor({ sheep: 4, cattle: 3, fireplace: true }); let r = buy(s, PARLOR); assert.equal(r.state.players[0]!.resources.food, 48); turn(s, 1, 'forest'); ready(s, 0)
    r = cookSheep(s, 4); assert.equal(r.state.players[0]!.resources.sheep, 0); assert.equal(r.state.players[0]!.resources.cattle, 3); assert.equal(r.state.players[0]!.resources.food, 56); assert.equal(printed(r), 1)
    const before = parlor({ sheep: 4, cattle: 3, fireplace: true }); assert.equal(cookSheep(before, 4).state.players[0]!.resources.food, 48); r = buy(before, PARLOR); assert.equal(r.state.players[0]!.resources.food, 52); assert.equal(printed(r), 1)
  })
  it('A057 N5 whole purchase undo restores bonus wood and printed point before stale safe retry', () => {
    const s = parlor({ sheep: 1, cattle: 1 }); const before = undoRuleSnapshot(s.getState()); let r = buy(s, PARLOR); assert.equal(r.state.players[0]!.resources.food, 44); assert.equal(printed(r), 1); assertRejectedUnchanged(s, () => s.resolveChoice(0, PARLOR)); assertUndoRestored(before, s.undoAction()); r = buy(s, PARLOR); assert.equal(r.state.players[0]!.resources.food, 44); assert.equal(printed(r), 1)
  })
  it('A057 N6 opponent housed sheep and cattle do not count for owner purchase bonus', () => {
    const r = buy(parlor({ sheep: 4, cattle: 3, opponent: true }), PARLOR); assert.deepEqual(food(r), [40, 40]); assert.equal(r.state.players[0]!.resources.sheep, 0); assert.equal(r.state.players[0]!.resources.cattle, 0); assert.equal(printed(r), 1)
  })
})
