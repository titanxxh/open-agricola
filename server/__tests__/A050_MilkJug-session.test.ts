import { describe, expect, it } from 'vitest'
import { type GameSession, type SessionResponse } from '../game/authoritative-session'
import { setWorkersAtHome } from '../../shared/domain/player'
import { confirmPlayerSwitch } from './_helpers/pending-confirms'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { createWorkSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
import { assertRejectedUnchanged, getChoiceOptions, assertUndoRestored, confirmNext, undoRuleSnapshot } from './_helpers/session-assertions'
import '../../shared/cards/A/A050_MilkJug'
import assert from 'node:assert/strict'
import { type GameState, type Resource, type PlayerState } from '../../shared/contract/types'
import { getOwnOrdinaryFenceReserveCount, getStableSupplyLimit } from '../../shared/domain/supply-tokens'
import { countUnusedFarmyardSpaces } from '../../shared/domain/farm'
import { type ZoneAssignment } from '../../shared/actions/effects/reorganize'
const CARD_ID = 'A050_MilkJug'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const purchaseSession = (clay: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 50, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = 0
  state.round = 1
  state.roundPhase = 'work'
  setWorkersAtHome(state, state.players[0]!, 2)
  state.players[0]!.minorHand = [CARD_ID]
  state.players[0]!.resources.clay = clay
  session.loadState(state)
  return session
}
const openMinorPrompt = (session: GameSession) => {
  let response = session.takeAction(0, 'meeting-place')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId !== 'wait') return response
  if (getChoiceOptions(response).some((option) => option.value === CARD_ID))
    return response
  const improvement = getChoiceOptions(response).find((option) => option.value.startsWith('action-improvement-'))
  if (improvement) response = session.resolveChoice(0, improvement.value)
  return response
}
const cardOption = (response: SessionResponse) => response.interaction.stateId === 'wait'
  ? getChoiceOptions(response).find((option) => option.value === CARD_ID)
  : undefined
const playMinor = (session: GameSession) => {
  const response = openMinorPrompt(session)
  if (!response.state.players[0]!.minorHand.includes(CARD_ID)) return response
  const option = cardOption(response)
  expect(option).toBeDefined()
  return session.resolveChoice(0, option!.value)
}
const actionSession = (actor: number) => {
  const session = sessionEvidence.track(createWorkSession({ seed: 50, options: { playerCount: 4 } }))
  const state = session.getState().state
  stabilizeRandomHands(state.players)
  state.currentPlayerIndex = actor
  state.round = 12
  state.roundPhase = 'work'
  state.players[0]!.minorPlayed = [CARD_ID]
  state.players.forEach((player, index) => {
    setWorkersAtHome(state, player, index === actor ? 2 : 0)
    player.resources.food = 0
    player.pastures = [{
        id: `pasture-${index}`,
        tiles: [{ row: 0, col: index }],
        animalType: null,
        animalCount: 0
      }]
  })
  state.actionSpaces.find((space) => space.id === 'cattle-market')!.resources.cattle = 1
  session.loadState(state)
  return session
}
const useCattleMarket = (session: GameSession, actor: number) => {
  let response = session.takeAction(actor, 'cattle-market')
  expect(response.ok, response.error).toBe(true)
  if (response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'animal-reorg') {
    response = session.resolveChoice(actor, 'confirm', { zones: [{
          id: `pasture-${actor}`,
          zoneType: 'pasture',
          animalType: 'cattle',
          animalCount: 1,
        }] })
  }
  while (
    response.interaction.stateId === 'wait'
    && response.interaction.request.kind === 'confirm-player-switch'
  ) response = confirmPlayerSwitch(session)
  return response
}
describe('A050 Milk Jug parity', () => {
  it('A050 S1: playing Milk Jug costs one clay and keeps the card in play', () => {
    const response = playMinor(purchaseSession(1))

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.clay).toBe(0)
    expect(response.state.players[0]!.minorPlayed).toContain(CARD_ID)
  })

  it('A050 S2: no clay keeps Milk Jug unavailable', () => {
    const session = purchaseSession(0)
    const response = openMinorPrompt(session)

    expect(cardOption(response)).toBeUndefined()
    expect(response.state.players[0]!.minorHand).toContain(CARD_ID)
  })

  it('A050 S3: owner using Cattle Market gains three food and gives every other player one', () => {
    const response = useCattleMarket(actionSession(0), 0)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 1, 1, 1])
  })

  it('A050 S4: opponent using Cattle Market still rewards the owner and every other player', () => {
    const response = useCattleMarket(actionSession(1), 1)

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([3, 1, 1, 1])
  })

  it('A050 S5: a non-Cattle-Market action does not trigger Milk Jug', () => {
    const session = actionSession(1)

    const response = session.takeAction(1, 'day-laborer')

    expect(response.ok, response.error).toBe(true)
    expect(response.state.players.map((player) => player.resources.food)).toEqual([0, 2, 0, 0])
  })
})
describe("A050 command boundaries", () => {
  const MILK = 'A050_MilkJug', YOUNG = 'A009_YoungAnimalMarket'
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
        p.minorHand = played ? ['__test_placeholder__'] : ["A050_MilkJug", '__test_placeholder__']
        p.minorPlayed = played ? ["A050_MilkJug"] : []
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
  function milk({ played = false, sheep = 0, young = false } = {}) {
    return setup({ round: 14, played, occupations: 0, resources: { clay: 1 } }, state => {
      for (const p of state.players)
        housing(p, p === state.players[0] ? sheep : 0, 0, 5)
      state.actionSpaces.find(a => a.id === 'cattle-market')!.resources.cattle = 1
      state.actionSpaces.find(a => a.id === 'sheep-market')!.resources.sheep = 1
      if (young)
        state.players[0]!.minorHand.push(YOUNG)
    })
  }
  function settle(s: GameSession, r: SessionResponse, actor: number) {
    for (let n = 0; n < 12 && r.interaction.stateId === 'wait'; n++) {
      if (r.interaction.request.kind === 'confirm-player-switch') {
        r = ok(confirmPlayerSwitch(s))
        continue
      }
      if (r.interaction.request.kind !== 'animal-reorg')
        break
      const p = r.state.players[actor]!, assignments: ZoneAssignment[] = []
      if (p.resources.sheep)
        assignments.push({ id: `sheep-${p.id}`, zoneType: 'pasture', animalType: 'sheep', animalCount: p.resources.sheep })
      if (p.resources.cattle)
        assignments.push({ id: `cattle-${p.id}`, zoneType: 'pasture', animalType: 'cattle', animalCount: p.resources.cattle })
      r = ok(s.resolveChoice(actor, 'confirm', { zones: assignments }))
    }
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player', JSON.stringify(r.interaction))
    return r
  }
  it("actual Milk Jug purchase pays one clay without immediate food", () => {
    deny(setup({ resources: { clay: 0 } }), MILK)
    const r = buy(milk(), MILK)
    assert.equal(r.state.players[0]!.resources.clay, 0)
    assert.deepEqual(food(r), [40, 40])
  })
  it("real purchase then owner or opponent Cattle Market use pays owner three and opponent one", () => {
    for (const actor of [0, 1]) {
      const s = milk()
      buy(s, MILK)
      if (actor === 0)
        turn(s, 1, 'forest')
      const r = settle(s, turn(s, actor, 'cattle-market'), actor)
      assert.deepEqual(food(r), [43, 41])
      assert.equal(r.state.players[actor]!.resources.cattle, 1)
      ready(s, 1 - actor)
      assertRejectedUnchanged(s, () => s.takeAction(1 - actor, 'cattle-market'))
    }
  })
  it("not yet played Milk Jug and actual Sheep Market do not award Cattle Market food", () => {
    const unplayed = milk()
    let r = settle(unplayed, turn(unplayed, 0, 'cattle-market'), 0)
    assert.deepEqual(food(r), [40, 40])
    assert.equal(r.state.players[0]!.resources.cattle, 1)
    const s = milk()
    buy(s, MILK)
    turn(s, 1, 'forest')
    r = settle(s, turn(s, 0, 'sheep-market'), 0)
    assert.deepEqual(food(r), [40, 40])
    assert.equal(r.state.players[0]!.resources.sheep, 1)
  })
  it("actual Young Animal Market cattle acquisition without Cattle Market gives no Milk Jug food", () => {
    const s = milk({ sheep: 1, young: true })
    buy(s, MILK)
    turn(s, 1, 'forest')
    ready(s, 0)
    const r = settle(s, buy(s, YOUNG, 'major-improvement'), 0)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.state.players[0]!.resources.cattle, 1)
    assert.deepEqual(food(r), [40, 40])
  })
  it("whole Cattle Market action undo and retry restores both recipients and housed cow", () => {
    const s = milk({ played: true })
    const before = undoRuleSnapshot(s.getState())
    let r = settle(s, turn(s, 0, 'cattle-market'), 0)
    assert.deepEqual(food(r), [43, 41])
    assertUndoRestored(before, s.undoAction())
    r = settle(s, turn(s, 0, 'cattle-market'), 0)
    assert.deepEqual(food(r), [43, 41])
    assert.equal(r.state.players[0]!.resources.cattle, 1)
  })
})
