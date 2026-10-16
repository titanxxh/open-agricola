import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { getAllTilePositions, countUnusedFarmyardSpaces } from '../../shared/domain/farm'
import { setWorkersAtHome } from '../../shared/domain/player'
import '../../shared/cards/A/A057_MilkingParlor'
import assert from 'node:assert/strict'
import { type GameState, type Resource, type PlayerState } from '../../shared/contract/types'
import { getOwnOrdinaryFenceReserveCount, getStableSupplyLimit } from '../../shared/domain/supply-tokens'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const CARD_ID = 'A057_MilkingParlor'
const FILLER = '__test_placeholder__'
const setup = ({ sheep = 0, cattle = 0, unused = 4, }: {
  sheep?: number
  cattle?: number
  unused?: number
} = {}) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 5057, options: { playerCount: 2 } }))
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
    { id: 'sheep', tiles: pastureTiles.slice(0, 2), animalType: sheep > 0 ? 'sheep' : null, animalCount: sheep },
    { id: 'cattle', tiles: pastureTiles.slice(2), animalType: cattle > 0 ? 'cattle' : null, animalCount: cattle },
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
  const enter = getChoiceOptions(response)?.find((option) => {
    return option.value.startsWith('action-improvement-')
  })
  if (enter) response = session.resolveChoice(0, enter.value)
  if (response.interaction.stateId !== 'wait') return response
  const option = getChoiceOptions(response)?.find((candidate) => candidate.value === CARD_ID)
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
describe("A057 command boundaries", () => {
  const PARLOR = 'A057_MilkingParlor'
  function ok(r: SessionResponse) { assert.equal(r.ok, true, r.error); return r; }
  function setup({ round = 5, played = false, occupations = 2, resources = {} }: {
    round?: number
    played?: boolean
    occupations?: number
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => { }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, options: { playerCount: 2 }, configure(state) {
        state.round = round
        state.availableMajorImprovements = []
        for (const p of state.players)
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0 })
        const p = state.players[0]!
        p.minorHand = played ? ['__test_placeholder__'] : ["A057_MilkingParlor", '__test_placeholder__']
        p.minorPlayed = played ? ["A057_MilkingParlor"] : []
        p.occupationPlayed = ['D115_FodderPlanter', 'A111_WallBuilder', 'A125_Priest'].slice(0, occupations)
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    s.withCtx(() => {
      for (const p of s.state.players)
        if (p.pastures.length === 2)
          assert.equal(getOwnOrdinaryFenceReserveCount(p), 5)
    })
    return s
  }
  function options(r: SessionResponse) { assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction)); return getChoiceOptions(r); }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
  }) => boolean) { const matches = options(r).filter(predicate); assert.equal(matches.length, 1, JSON.stringify(r.interaction)); const o = matches[0]; assert.ok(o, JSON.stringify(r.interaction)); assert.ok(r.interaction.stateId === 'wait'); return ok(s.resolveChoice(r.interaction.playerIndex, o.value)); }
  function buyMenu(s: GameSession, space = 'meeting-place') {
    let r = ok(s.takeAction(0, space))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string, space = 'meeting-place') {
    const r = buyMenu(s, space)
    if (!r.state.players[0]!.minorHand.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return ok(s.resolveChoice(0, card))
  }
  function deny(s: GameSession, card: string) { const r = buyMenu(s); assert.ok(!r.state.players[0]!.minorPlayed.includes(card)); assertRejectedUnchanged(s, () => s.resolveChoice(0, card)); }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = confirmNext(s, r)
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) { ready(s, actor); return ok(s.takeAction(actor, space)); }
  function food(r: SessionResponse) { return r.state.players.map(p => p.resources.food); }
  function housing(p: PlayerState, sheep = 0, cattle = 0, unused = 4) {
    p.resources.sheep = sheep
    p.resources.cattle = cattle
    p.pastures = [{ id: `sheep-${p.id}`, tiles: [{ row: 0, col: 3 }, { row: 1, col: 3 }], animalType: sheep ? 'sheep' : null, animalCount: sheep }, { id: `cattle-${p.id}`, tiles: [{ row: 0, col: 4 }, { row: 1, col: 4 }], animalType: cattle ? 'cattle' : null, animalCount: cattle }]
    p.fenceSegments = ['H-0-3', 'H-2-3', 'H-0-4', 'H-2-4', 'V-0-3', 'V-1-3', 'V-0-4', 'V-1-4', 'V-0-5', 'V-1-5'].map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
    p.stableTiles = [{ row: 0, col: 3 }, { row: 0, col: 4 }]
    const connected = [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }, { row: 2, col: 2 }, { row: 2, col: 1 }]
    p.fields = connected.slice(0, 9 - unused).map(t => ({ ...t, stacks: [] }))
    assert.equal(getStableSupplyLimit(p) - p.stableTiles.length, 2)
    assert.equal(countUnusedFarmyardSpaces(p), unused)
    const used = new Set([...p.roomTiles, ...p.fields, ...p.stableTiles, ...p.pastures.flatMap(pasture => pasture.tiles)].map(t => `${t.row},${t.col}`))
    assert.equal(used.size, 15 - unused)
  }
  function parlor({ sheep = 0, cattle = 0, unused = 4, wood = 2, fireplace = false, opponent = false } = {}) {
    return setup({ round: 14, occupations: 0, resources: { wood } }, state => {
      housing(state.players[0]!, opponent ? 0 : sheep, opponent ? 0 : cattle, unused)
      if (opponent)
        housing(state.players[1]!, sheep, cattle)
      if (fireplace) {
        state.players[0]!.improvements = ['Major_Fireplace1']
        state.availableMajorImprovements = state.availableMajorImprovements.filter(id => id !== 'Major_Fireplace1')
      }
    })
  }
  function printed(r: SessionResponse) { assert.ok(r.scores); assert.ok(r.scores[0]); return r.scores[0].categories.find(c => c.key === 'cards')?.entries.find(e => e.type === 'card' && e.cardId === PARLOR)?.score ?? 0; }
  it("actual Milking Parlor purchase needs two wood and four distinct unused farm spaces", () => {
    deny(parlor({ wood: 1 }), PARLOR)
    deny(parlor({ unused: 3 }), PARLOR)
    const r = buy(parlor(), PARLOR)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(printed(r), 1)
    assert.equal(r.state.players[0]!.resources.food, 40)
  })
  it("legally housed sheep thresholds include intervening two and over four cap", () => {
    for (const [sheep, bonus] of [[0, 0], [1, 2], [2, 2], [3, 3], [4, 4], [5, 4]] satisfies Array<[
      number,
      number
    ]>) {
      const r = buy(parlor({ sheep }), PARLOR)
      assert.equal(r.state.players[0]!.resources.food, 40 + bonus)
      assert.equal(printed(r), 1)
    }
  })
  it("legally housed cattle thresholds include over three cap", () => {
    for (const [cattle, bonus] of [[0, 0], [1, 2], [2, 3], [3, 4], [4, 4]] satisfies Array<[
      number,
      number
    ]>) {
      const r = buy(parlor({ cattle }), PARLOR)
      assert.equal(r.state.players[0]!.resources.food, 40 + bonus)
      assert.equal(printed(r), 1)
    }
  })
  function cookSheep(s: GameSession, amount: number) {
    const r = ok(s.takeAnytimeAction(0, 'exchange'))
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice', JSON.stringify(r.interaction))
    const exchange = getChoiceOptions(r).find(o => o.effectPreview?.kind === 'resourceExchange' && o.effectPreview.resourcesPaid?.sheep === amount)
    assert.ok(exchange, JSON.stringify(r.interaction))
    assert.ok(exchange.value.startsWith('trade:'))
    return ok(s.resolveChoice(0, `bulk:${exchange.value.split(':')[1]}=${amount}`))
  }
  it("combined sheep and cattle bonus is immediate and later real cooking cannot claw it back", () => {
    const s = parlor({ sheep: 4, cattle: 3, fireplace: true })
    let r = buy(s, PARLOR)
    assert.equal(r.state.players[0]!.resources.food, 48)
    turn(s, 1, 'forest')
    ready(s, 0)
    r = cookSheep(s, 4)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.state.players[0]!.resources.cattle, 3)
    assert.equal(r.state.players[0]!.resources.food, 56)
    assert.equal(printed(r), 1)
    const before = parlor({ sheep: 4, cattle: 3, fireplace: true })
    assert.equal(cookSheep(before, 4).state.players[0]!.resources.food, 48)
    r = buy(before, PARLOR)
    assert.equal(r.state.players[0]!.resources.food, 52)
    assert.equal(printed(r), 1)
  })
  it("whole purchase undo restores bonus wood and printed point before stale safe retry", () => {
    const s = parlor({ sheep: 1, cattle: 1 })
    const before = undoRuleSnapshot(s.getState())
    let r = buy(s, PARLOR)
    assert.equal(r.state.players[0]!.resources.food, 44)
    assert.equal(printed(r), 1)
    assertRejectedUnchanged(s, () => s.resolveChoice(0, PARLOR))
    assertUndoRestored(before, s.undoAction())
    r = buy(s, PARLOR)
    assert.equal(r.state.players[0]!.resources.food, 44)
    assert.equal(printed(r), 1)
  })
  it("opponent housed sheep and cattle do not count for owner purchase bonus", () => {
    const r = buy(parlor({ sheep: 4, cattle: 3, opponent: true }), PARLOR)
    assert.deepEqual(food(r), [40, 40])
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.state.players[0]!.resources.cattle, 0)
    assert.equal(printed(r), 1)
  })
})
