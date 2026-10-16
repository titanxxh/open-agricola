import { describe, expect, it } from 'vitest'
import { GameSession, type SessionResponse } from '../game/authoritative-session'
import { stabilizeRandomHands } from './_helpers/stabilize-random-hands'
import { executeCardListener, getRegisteredCardListeners } from '../../shared/cards/card-listeners'
import { readCardResourceStats } from '../../shared/cards/helpers/card-state'
import { type DraftGameEvent } from '../../shared/contract/events'
import { resolveTriggerIfPresent } from './_helpers/trigger-select'
import '../../shared/cards/A/A083_ShepherdsCrook'
import assert from 'node:assert/strict'
import { type GameState, type Resource } from '../../shared/contract/types'
import { createWorkSession } from './_helpers/session-fixtures'
import { assertRejectedUnchanged, assertUndoRestored, confirmNext, undoRuleSnapshot, getChoiceOptions } from './_helpers/session-assertions'
import { createScenarioEvidence } from './_helpers/scenario-evidence'
const sessionEvidence = createScenarioEvidence(import.meta.url)
const edgesForTwoByTwo = [
  'H-0-1',
  'H-0-2',
  'H-2-1',
  'H-2-2',
  'V-0-1',
  'V-1-1',
  'V-0-3',
  'V-1-3',
]
const fenceBuilt = (newPastures: Array<{
  tiles?: unknown[]
}>): DraftGameEvent<'farm.fenceBuilt'> => ({
  type: 'farm.fenceBuilt',
  newlyUsedTiles: [],
  newlyEnclosedPastureTiles: [],
  fences: [{ edge: 'H-0-0', type: 'fence' }],
  newFenceEdges: ['H-0-0'],
  newPastures,
})
describe('A083_ShepherdsCrook session flow', () => {
  it('uses fence delta in listener context to grant sheep', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    expect(session.withCtx(() => getRegisteredCardListeners()).some((entry) => entry.id === 'A83-shepherds-crook-after-fencing')).toBe(true)
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    state.currentPlayerIndex = 0
    const player = state.players[0]!
    player.minorPlayed.push('A083_ShepherdsCrook')
    player.resources.wood = 10
    session.loadState(state)
    let resp = session.takeAction(0, 'fencing')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.promptKey : undefined)
      .toBe('ui.interactionFenceSelect')
    resp = session.commitSelectionChoice(0, {
      edges: edgesForTwoByTwo,
      extraWood: 0,
    })
    resp = resolveTriggerIfPresent(session, resp, 'A083_ShepherdsCrook')
    expect(resp.interaction.stateId).toBe('wait')
    expect(resp.state.players[0]!.resources.sheep).toBe(2)
    expect(resp.state.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'farm.fenceBuilt',
        newlyUsedTiles: [],
        newlyEnclosedPastureTiles: [],
        newPastures: expect.arrayContaining([
          expect.objectContaining({
            tiles: expect.arrayContaining([
              expect.objectContaining({ row: expect.any(Number), col: expect.any(Number) }),
            ]),
          }),
        ]),
      }),
    ]))
    expect(readCardResourceStats(resp.state.players[0]!, 'A083_ShepherdsCrook')).toMatchObject({
      paid: {},
      gained: { sheep: 2 },
    })
  })
  it('does not grant sheep for smaller new pasture event metadata', () => {
    const session = sessionEvidence.track(createWorkSession({ seed: 42 }))
    const listener = session.withCtx(() => getRegisteredCardListeners()).find((entry) => entry.id === 'A83-shepherds-crook-after-fencing')
    expect(listener).toBeDefined()
    stabilizeRandomHands(session.state.players)
    const state = session.getState().state
    state.players = state.players.slice(0, 2)
    const player = state.players[0]!
    player.minorPlayed.push('A083_ShepherdsCrook')
    const actionEvents = [fenceBuilt([{ tiles: [{ row: 0, col: 0 }] }])]
    const result = session.withCtx(() => executeCardListener(listener!, {
      actionHooks: session.actionHooks,
      state,
      player,
      space: state.actionSpaces.find((entry) => entry.id === 'fencing')!,
      actionId: 'fence',
      phase: 'immediatelyAfter',
      result: { type: 'ok', extraData: { newPastures: [{ tiles: [{}, {}, {}, {}] }] } },
      transactionEvents: actionEvents,
      actionEvents,
    }))
    expect(result).toBeUndefined()
  })
})
describe("A083 command boundaries", () => {
  const CROOK = 'A083_ShepherdsCrook'
  function ok(r: SessionResponse) {
    assert.equal(r.ok, true, r.error)
    return r
  }
  function record(name: string, response: SessionResponse) {
    sessionEvidence.record(name, response)
    return response
  }
  function setup({ played = true, resources = {} }: {
    played?: boolean
    resources?: Partial<Resource>
  } = {}, configure: (state: GameState) => void = () => {
  }) {
    const s = sessionEvidence.track(createWorkSession({ seed: 4242, configure(state) {
        state.round = 14
        state.availableMajorImprovements = []
        for (const p of state.players) {
          p.minorHand = ['__test_placeholder__']
          p.occupationHand = ['__test_placeholder__']
          p.minorPlayed = []
          p.occupationPlayed = []
          Object.assign(p.resources, { food: 40, wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0 })
          assert.equal(p.workers.length, 5)
          assert.equal(p.workers.filter(w => w.isActive).length, 2)
        }
        const p = state.players[0]!
        p.minorHand = [...(played ? [] : [CROOK]), 'B007_Wage']
        p.minorPlayed = played ? [CROOK] : []
        Object.assign(p.resources, resources)
        configure(state)
      } }))
    record('fixture', s.getState())
    return s
  }
  function options(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && (r.interaction.request.kind === 'choice' || r.interaction.request.kind === 'select-trigger'), JSON.stringify(r.interaction))
    return getChoiceOptions(r)
  }
  function choose(s: GameSession, r: SessionResponse, predicate: (o: {
    value: string
    labelKey?: string
    sourceCard?: string
  }) => boolean) {
    const selected = options(r).filter(option => predicate(option) && !option.disabled)
    assert.equal(selected.length, 1, JSON.stringify(r.interaction))
    const o = selected[0]
    assert.ok(o, JSON.stringify(r.interaction))
    assert.ok(r.interaction.stateId === 'wait')
    return record(`resolveChoice:${o.value}`, ok(s.resolveChoice(r.interaction.playerIndex, o.value)))
  }
  function buyMenu(s: GameSession) {
    let r = record('takeAction:meeting-place', ok(s.takeAction(0, 'meeting-place')))
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'choice' && getChoiceOptions(r).some(o => o.value.startsWith('action-improvement-')))
      r = choose(s, r, o => o.value.startsWith('action-improvement-'))
    return r
  }
  function buy(s: GameSession, card: string) {
    const r = buyMenu(s)
    if (r.state.players[0]!.minorPlayed.includes(card))
      return r
    assert.ok(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)))
    return record(`buy:${card}`, ok(s.resolveChoice(0, card)))
  }
  function deny(s: GameSession, card: string) {
    let r = buyMenu(s)
    assert.ok(!r.state.players[0]!.minorPlayed.includes(card))
    assert.equal(options(r).some(o => o.value === card && !('disabled' in o && o.disabled)), false)
    record(`denied:${card}`, assertRejectedUnchanged(s, () => s.resolveChoice(0, card)))
    const food = r.state.players[0]!.resources.food
    r = ok(s.resolveChoice(0, 'B007_Wage'))
    assert.equal(r.state.players[0]!.resources.food, food + 2)
    return r
  }
  function ready(s: GameSession, actor: number) {
    let r = s.getState()
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'confirm-next-player')
      r = record('confirm', confirmNext(s, r))
    assert.equal(r.interaction.stateId, 'idle', JSON.stringify(r.interaction))
    assert.equal(r.state.currentPlayerIndex, actor)
    return r
  }
  function turn(s: GameSession, actor: number, space: string) {
    ready(s, actor)
    return record(`takeAction:${actor}:${space}`, ok(s.takeAction(actor, space)))
  }
  function rect(row: number, col: number, height: number, width: number) {
    return [...Array.from({ length: width }, (_, i) => `H-${row}-${col + i}`), ...Array.from({ length: width }, (_, i) => `H-${row + height}-${col + i}`), ...Array.from({ length: height }, (_, i) => `V-${row + i}-${col}`), ...Array.from({ length: height }, (_, i) => `V-${row + i}-${col + width}`)]
  }
  function animalMenu(r: SessionResponse) {
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg', JSON.stringify(r.interaction))
    return r.interaction.request
  }
  function settle(s: GameSession, r: SessionResponse) {
    if (r.interaction.stateId === 'wait' && r.interaction.request.kind === 'animal-reorg')
      r = record('reorg-default', ok(s.resolveChoice(r.interaction.playerIndex, 'confirm', { zones: r.interaction.request.zones })))
    return r
  }
  function fence(s: GameSession, edges: string[], actor = 0) {
    const r = turn(s, actor, 'fencing')
    assert.ok(r.interaction.stateId === 'wait' && r.interaction.request.kind === 'farm-select')
    return record('fence', ok(s.commitSelectionChoice(actor, { edges, extraWood: 0 })))
  }
  it("fee zero denied exact one wood purchase gives no immediate sheep", () => {
    deny(setup({ played: false }), CROOK)
    const r = buy(setup({ played: false, resources: { wood: 1 } }), CROOK)
    assert.equal(r.state.players[0]!.resources.wood, 0)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
  })
  it("actual three four five area fences cross threshold once", () => {
    for (const [height, width, expected] of [[1, 3, 0], [2, 2, 2], [1, 5, 2]]) {
      const edges = rect(0, width === 5 ? 0 : 1, height!, width!)
      const s = setup({ resources: { wood: edges.length } })
      const r = settle(s, fence(s, edges))
      assert.equal(r.state.players[0]!.resources.sheep, expected)
      assert.equal(r.state.players[0]!.fenceSegments.length, edges.length)
      assert.equal(gainCount(r, CROOK), expected ? 1 : 0)
    }
  })
  it("new small pasture does not reward an existing four area pasture", () => {
    const old = rect(0, 1, 2, 2), extra = rect(0, 3, 1, 1).filter(e => !old.includes(e))
    const s = setup({ resources: { wood: extra.length } }, state => {
      const p = state.players[0]!
      p.fenceSegments = old.map(edge => ({ edge, type: 'fence', source: { kind: 'own', ownerPlayerId: p.id } }))
      p.pastures = [{ id: 'old', tiles: [{ row: 0, col: 1 }, { row: 0, col: 2 }, { row: 1, col: 1 }, { row: 1, col: 2 }], animalType: null, animalCount: 0 }]
    })
    const r = fence(s, extra)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.state.players[0]!.pastures.length, 2)
  })
  it("two new four area pastures use fourteen fences and grant four sheep", () => {
    const edges = [...rect(0, 1, 2, 4), 'V-0-3', 'V-1-3']
    const s = setup({ resources: { wood: 14 } })
    let r = fence(s, edges)
    const q = animalMenu(r)
    const zones = q.zones.filter(z => z.zoneType === 'pasture').map(z => ({ ...z, animalType: 'sheep', animalCount: 2 }))
    assert.equal(zones.length, 2)
    r = record('two-pasture-housing', ok(s.resolveChoice(0, 'confirm', { zones })))
    assert.equal(r.state.players[0]!.resources.sheep, 4)
    assert.equal(r.state.players[0]!.fenceSegments.length, 14)
    assert.equal(gainCount(r, CROOK), 1)
  })
  it("unplayed and opponent fences exclude holder reward", () => {
    let s = setup({ played: false, resources: { wood: 8 } })
    let r = fence(s, rect(0, 1, 2, 2))
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    s = setup({}, state => {
      state.players[1]!.resources.wood = 8
    })
    turn(s, 0, 'reed-bank')
    r = fence(s, rect(0, 1, 2, 2), 1)
    assert.equal(r.state.players[0]!.resources.sheep, 0)
    assert.equal(r.state.players[1]!.resources.sheep, 0)
  })
  it("invalid fence targets reject before a legal fence control", () => {
    const s = setup({ resources: { wood: 8 } })
    turn(s, 0, 'fencing')
    record('outside-fence', assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: ['H-99-99'], extraWood: 0 })))
    record('room-fence', assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { edges: rect(1, 0, 1, 1), extraWood: 0 })))
    const r = settle(s, record('legal-fence-retry', ok(s.commitSelectionChoice(0, { edges: rect(0, 1, 2, 2), extraWood: 0 }))))
    assert.equal(r.state.players[0]!.resources.sheep, 2)
  })
  it("whole fence housing undo restores finite pieces before one retry", () => {
    const s = setup({ resources: { wood: 8 } })
    const before = undoRuleSnapshot(s.getState())
    settle(s, fence(s, rect(0, 1, 2, 2)))
    assertUndoRestored(before, record('undo-whole-fence', s.undoAction()))
    const r = settle(s, fence(s, rect(0, 1, 2, 2)))
    assert.equal(r.state.players[0]!.resources.sheep, 2)
    assert.equal(r.state.players[0]!.resources.wood, 0)
  })
  function gainCount(r: SessionResponse, card: string) {
    return r.state.log.filter(e => e.key === 'log.cardEffectGain' && e.params?.cardId === card).length
  }
})
