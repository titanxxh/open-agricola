import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { getCardEffect } from '../../shared/cards/card-effects'
import { markAllWorkersUsed } from '../../shared/domain/player'
import type { ActionFlow, FarmTilePosition, GameState, PlayerState } from '../../shared/contract/types'
import { resolveNonSkipChoice, resolveSkipChoice, resolveTriggerIfPresent } from './_helpers/trigger-select'

import '../../shared/cards/C/C057_Crudite'
import '../../shared/cards/B/B068_Beanfield'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit38Fields from './_helpers/audit/ae-negative-38-fields'

const CARD_ID = 'C057_Crudite'
const ANYTIME_ID = 'C57-crudite-anytime'

const createPlayer = (id = 'p1'): PlayerState =>
  ({
    id, name: id, color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 5,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
      { id: '3', isActive: false, isNewborn: false },
      { id: '4', isActive: false, isNewborn: false },
      { id: '5', isActive: false, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [CARD_ID],
    occupationHand: [], occupationPlayed: [], houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 1, currentPlayerIndex: 0, players,
    actionSpaces: [], log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1, availableMajorImprovements: [],
    futureMeeples: [], pendingFutureMeeples: [],
    gameOver: false, workPhaseObtainedResources: {},
  }) as GameState

const setupSession = (fieldCounts = [3, 2, 1]) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 24
    player.resources.vegetable = 0
    markAllWorkersUsed(state, player)
  })

  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.fields = fieldCounts.map((remaining, col) => ({
    row: 0,
    col,
    stacks: [{ kind: 'vegetable' as const, remaining }],
  }))

  session.loadState(state)
  return session
}

const setupAnytimeSession = (fieldCounts = [3, 2, 1], cardFieldRemaining?: number) => {
  const session = new GameSession(42)
  const state = session.getState().state
  state.players = state.players.slice(0, 2)
  state.round = 4
  state.currentPlayerIndex = 0
  state.players.forEach((player) => {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
    player.resources.food = 20
    player.resources.vegetable = 0
  })
  const player = state.players[0]!
  player.minorPlayed.push(CARD_ID)
  player.fields = fieldCounts.map((remaining, col) => ({
    row: 0,
    col,
    stacks: [{ kind: 'vegetable' as const, remaining }],
  }))
  if (cardFieldRemaining !== undefined) {
    player.minorPlayed.push('B068_Beanfield')
    player.cardStates.B068_Beanfield = {
      extraData: { cardFieldStacks: [{ crop: 'vegetable', remaining: cardFieldRemaining }] },
    }
  }
  session.loadState(state)
  const resp = session.takeAction(0, 'farmland')
  expect(resp.ok).toBe(true)
  expect(resp.interaction.stateId).toBe('wait')
  return session
}

const fieldCountsOf = (player: PlayerState) =>
  player.fields.map((field) => field.stacks.at(-1)?.remaining ?? 0)

const acceptOptional = (session: GameSession, resp: ReturnType<GameSession['performRoundEnd']>) => {
  resp = resolveTriggerIfPresent(session, resp, CARD_ID)
  return resolveNonSkipChoice(session, resp)
}

const skipOptional = (session: GameSession, resp: ReturnType<GameSession['performRoundEnd']>) => {
  resp = resolveTriggerIfPresent(session, resp, CARD_ID)
  return resolveSkipChoice(session, resp)
}

const skipPostReapAnytime = (
  session: GameSession,
  resp: ReturnType<GameSession['performRoundEnd']>,
) => {
  expect(session.peekEnginePendingEnvelope()?.syntheticKind).toBe('post-reap-anytime')
  expect(resp.interaction.anytimeActions.map((action) => action.id)).toContain(ANYTIME_ID)
  if (resp.interaction.stateId !== 'wait') throw new Error('expected post-reap anytime window')
  return session.resolveChoice(resp.interaction.playerIndex, '__skip__')
}

const expectC57Selection = (resp: ReturnType<GameSession['performRoundEnd']>) => {
  expect(resp.interaction.stateId).toBe('wait')
  if (resp.interaction.stateId !== 'wait') throw new Error('expected C57 selection')
  expect(resp.interaction.request.selection?.kind).toBe('farm-position')
  expect(resp.interaction.request.selection?.minSelections).toBe(1)
  return resp.interaction.request.selection?.selectablePositions ?? []
}

const hasC57Selection = (resp: ReturnType<GameSession['performRoundEnd']>) =>
  resp.interaction.stateId === 'wait'
  && resp.interaction.request.selection?.kind === 'farm-position'
  && resp.interaction.sourceCard === CARD_ID

const selectPositions = (session: GameSession, positions: FarmTilePosition[]) =>
  session.commitSelectionChoice(0, { positions })

describe('C057_Crudite', () => {
  it('onBuy offers pay 3 food for 1 vegetable when player has food', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.resources.food = 5
    const state = createState(player)

    const flow = withActiveRegistry(ruleRegistry, () => effect!.onBuy!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    const children = (flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children[0].actionId).toBe('pay')
    expect(children[0].params).toEqual({ food: 3 })
    expect(children[1].actionId).toBe('gain')
    expect(children[1].params).toEqual({ vegetable: 1 })
  })

  it('onBuy returns undefined when player has < 3 food', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))

    const player = createPlayer()
    player.resources.food = 2
    const state = createState(player)

    const flow = withActiveRegistry(ruleRegistry, () => effect!.onBuy!(state, player))
    expect(flow).toBeUndefined()
  })

  it('hook-level harvest returns optional selection and does not mutate fields', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const effect = withActiveRegistry(ruleRegistry, () => getCardEffect(CARD_ID))
    expect(effect).toBeDefined()

    const player = createPlayer()
    player.fields = [
      { row: 0, col: 0, stacks: [{ kind: 'vegetable', remaining: 3 }] },
      { row: 0, col: 1, stacks: [{ kind: 'vegetable', remaining: 2 }] },
      { row: 0, col: 2, stacks: [{ kind: 'vegetable', remaining: 1 }] },
    ]
    const state = createState(player)

    const flow = withActiveRegistry(ruleRegistry, () => effect!.onStartHarvestFieldPhase!(state, player))
    expect(flow).toBeDefined()
    expect(flow!.type).toBe('seq')
    expect(flow!.optional).toBe(true)
    const selection = (flow as Extract<ActionFlow, { type: 'seq' }>).children[0] as Extract<ActionFlow, { type: 'leaf' }>
    expect(selection.actionId).toBe('field-operation')
    expect(selection.actionContext?.selectionKind).toBe('farm-position')
    expect(selection.actionContext?.selectableTiles).toEqual([{ row: 0, col: 0 }, { row: 0, col: 1 }])
    expect(selection.actionContext?.minSelections).toBe(1)
    expect(selection.actionContext?.maxSelections).toBe(2)
    expect(fieldCountsOf(player)).toEqual([3, 2, 1])
  })

  it('harvest skip leaves C57 unused and normal reap harvests all fields', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = skipOptional(session, resp)
    resp = skipPostReapAnytime(session, resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 1, 0])
    expect(player.resources.vegetable).toBe(3)
    expect(player.resources.food).toBe(20)
  })

  it('harvest multi-select A+B removes one vegetable from each before normal reap', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([1, 0, 0])
    expect(player.resources.vegetable).toBe(3)
    expect(player.resources.food).toBe(28)
  })

  it('harvest partial select B removes only that field before normal reap', () => {
    const session = setupSession()
    let resp = session.performRoundEnd()
    resp = acceptOptional(session, resp)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 1 }])
    resp = skipPostReapAnytime(session, resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 0, 0])
    expect(player.resources.vegetable).toBe(3)
    expect(player.resources.food).toBe(24)
  })

  it('anytime multi-select A+B removes one vegetable from each selected field', () => {
    const session = setupAnytimeSession()
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 1 }])

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([2, 1, 1])
    expect(player.resources.food).toBe(28)
  })

  it('anytime single source resolves without waiting for selection', () => {
    const session = setupAnytimeSession([2, 1])
    const resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)

    const player = resp.state.players[0]!
    expect(resp.interaction.stateId === 'wait' ? resp.interaction.sourceCard : undefined).not.toBe(CARD_ID)
    expect(fieldCountsOf(player)).toEqual([1, 1])
    expect(player.resources.food).toBe(24)
  })

  it('anytime selection removes a vegetable from a Card Field', () => {
    const session = setupAnytimeSession([3], 2)
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)

    resp = selectPositions(session, [{ row: -1, col: 2068 }])
    expect(resp.ok).toBe(true)
    expect(resp.state.players[0]!.cardStates.B068_Beanfield?.extraData?.cardFieldStacks).toEqual([
      { crop: 'vegetable', remaining: 1 },
    ])
    expect(resp.state.players[0]!.fields[0]!.stacks[0]!.remaining).toBe(3)
    expect(resp.state.players[0]!.resources.food).toBe(24)
  })

  it('invalid source selection A+C does not partially mutate fields or food', () => {
    const session = setupAnytimeSession()
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)
    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 2 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('invalid selection position')
    expectC57Selection(resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([3, 2, 1])
    expect(player.resources.food).toBe(20)
  })

  it('empty or duplicate source selection fails and preserves C57 pending', () => {
    const session = setupAnytimeSession()
    let resp = session.takeAnytimeAction(0, ANYTIME_ID)
    expect(resp.ok).toBe(true)
    expectC57Selection(resp)

    resp = selectPositions(session, [])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('not enough selection positions')
    expectC57Selection(resp)

    resp = selectPositions(session, [{ row: 0, col: 0 }, { row: 0, col: 0 }])
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('duplicate selection position')
    expectC57Selection(resp)

    resp = session.commitSelectionChoice(0, { cancel: true })
    expect(resp.ok).toBe(false)
    expect(resp.error).toBe('action cancel is not allowed')
    expectC57Selection(resp)

    const player = resp.state.players[0]!
    expect(fieldCountsOf(player)).toEqual([3, 2, 1])
    expect(player.resources.food).toBe(20)
  })

  it('no eligible fields offers no harvest C57 selection and no anytime action', () => {
    const harvestSession = setupSession([1, 1])
    const harvestResp = harvestSession.performRoundEnd()
    expect(hasC57Selection(harvestResp)).toBe(false)

    const harvestPlayer = harvestResp.state.players[0]!
    expect(fieldCountsOf(harvestPlayer)).toEqual([0, 0])
    expect(harvestPlayer.resources.vegetable).toBe(2)
    expect(harvestPlayer.resources.food).toBe(20)

    const anytimeSession = setupAnytimeSession([1, 1])
    const actionResp = anytimeSession.takeAnytimeAction(0, ANYTIME_ID)
    expect(actionResp.ok).toBe(false)
  })
})

describe('ae-negative-38-fields', () => {
  const { sessions, save, ok, finish, buy, paid, crudite } = audit38Fields
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('C057 N1 real free purchase may pay exactly three food for one vegetable or decline without receiving it', () => {
      const rows = [];
      for (const accept of [true, false] as const) {
          const s = crudite(false, [], 'vegetable', 3), p = buy(s, 'C057_Crudite'), r = finish(s, accept ? paid(s, p, 'C057_Crudite', 'food') : p);
          assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.vegetable], accept ? [0, 1] : [3, 0]);
          rows.push({ p, r });
      }
      const q = crudite(false, [], 'vegetable', 2), poor = finish(q, buy(q, 'C057_Crudite'));
      assert.deepEqual([poor.state.players[0]!.resources.food, poor.state.players[0]!.resources.vegetable], [2, 0]);
      save('C057-N1', { rows, poor });
  });
  it('C057 N2 actual anytime checks empty duplicate and unavailable field before selecting one or both distinct top vegetables', () => {
      const rows = [];
      for (const count of [1, 2] as const) {
          const s = crudite(), p = ok(s.takeAnytimeAction(0, 'C57-crudite-anytime')), empty = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [] })), duplicate = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 0, col: 1 }, { row: 0, col: 1 }] })), bad = assertRejectedUnchanged(s, () => s.commitSelectionChoice(0, { positions: [{ row: 1, col: 0 }] })), r = finish(s, ok(s.commitSelectionChoice(0, { positions: Array.from({ length: count }, (_, i) => ({ row: 0, col: i + 1 })) })));
          assert.deepEqual(r.state.players[0]!.fields.map(f => f.stacks[0]?.remaining), count === 1 ? [1, 2] : [1, 1]);
          assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.vegetable], [100 + 4 * count, 0]);
          rows.push({ p, empty, duplicate, bad, r });
      }
      save('C057-N2', rows);
  });
  it('C057 N3 one vegetable grain and a held card cannot discard crops while a single eligible two vegetable field removes only its top', () => {
      const rows = [];
      for (const [played, counts, kind] of [[true, [1], 'vegetable'], [true, [2], 'grain'], [false, [2], 'vegetable']] as const) {
          const s = crudite(played, [...counts], kind), bad = s.takeAnytimeAction(0, 'C57-crudite-anytime');
          assert.equal(bad.ok, false);
          assert.equal(bad.state.players[0]!.resources.food, 100);
          rows.push(bad);
      }
      const q = crudite(true, [2]), single = finish(q, ok(q.takeAnytimeAction(0, 'C57-crudite-anytime')));
      assert.deepEqual([single.state.players[0]!.fields[0]!.stacks[0]!.remaining, single.state.players[0]!.resources.food], [1, 104]);
      save('C057-N3', { rows, single });
  });
})
