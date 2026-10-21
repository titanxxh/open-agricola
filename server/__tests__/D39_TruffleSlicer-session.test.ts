import { CardRegistry as TestCardRegistry } from '../../shared/cards/registry'
import { withActiveRegistry } from '../../shared/cards/active-registry'
import { createOfficialCardRegistry } from '../../shared/cards/__tests__/card-environment'
import { describe, expect, it, afterEach } from 'vitest'
import { getRegisteredCardListeners, executeCardListener, type CardListenerContext } from '../../shared/cards/card-listeners'
import type { ActionSpace, GameState, PlayerState } from '../../shared/contract/types'

import '../../shared/cards/D/D039_TruffleSlicer'
import type { ActionFlow } from '../../shared/contract/types'
import assert from 'node:assert/strict'
import { assertRejectedUnchanged } from './_helpers/negative-rule-audit'
import * as audit35Placement from './_helpers/audit/ae-negative-35-placement'

const CARD_ID = 'D039_TruffleSlicer'

const createPlayer = (): PlayerState =>
  ({
    id: 'p1',
    name: 'P1',
    color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 3,
      grain: 0, vegetable: 0, sheep: 0, boar: 2, cattle: 0, begging: 0,
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
    occupationHand: [], occupationPlayed: [],houseAnimals: {}, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
    activeModifiers: [], cardStates: {},
  }) as PlayerState

const createState = (...players: PlayerState[]): GameState =>
  ({
    round: 3,
    roundPhase: 'work',
    currentPlayerIndex: 0,
    players,
    actionSpaces: [],
    log: [],
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
    workPhaseObtainedResources: {},
  }) as GameState

const createSpace = (id: string): ActionSpace =>
  ({
    id,
    nameKey: `actions.${id}.name`,
    descriptionKey: `actions.${id}.description`,
    roundAvailable: 1,
    gainPerRound: {},
    canBeExecutedByPlayer: () => true,
    execute: () => ({ type: 'ok' }),
    resources: { wood: 0, clay: 0, reed: 0, stone: 0, food: 0, grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0 },
    takenBy: [],
  }) as ActionSpace

const findListener = (ruleOwner: TestCardRegistry, id: string) =>
  {
  const lookupRule1 = () => getRegisteredCardListeners().find((l) => l.id === id)
  return withActiveRegistry(ruleOwner, lookupRule1)
}

describe('D039_TruffleSlicer', () => {
  it('triggers optional pay 1 food for 1 bonus VP on forest space with boar', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'D39-truffle-slicer-before-place-farmer')
    expect(listener).toBeDefined()

    const player = createPlayer()
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener!, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'before',
      result: { type: 'ok' },
    } as unknown as CardListenerContext))

    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
    expect((result!.flow as Extract<ActionFlow, { type: 'leaf' }>).optional).toBe(true)
    const children = (result!.flow as Extract<ActionFlow, { type: 'seq' }>).children
    expect(children).toHaveLength(2)
    expect(children[0].actionId).toBe('pay')
    expect(children[0].params).toEqual({ food: 1 })
    expect(children[1].actionId).toBe('bonus-vp')
    expect(children[1].sourceCard).toBe(CARD_ID)
  })

  it('triggers on copse space', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'D39-truffle-slicer-before-place-farmer')!
    const player = createPlayer()
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('copse'),
      actionId: 'place-farmer',
      phase: 'before',
      result: { type: 'ok' },
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
  })

  it('triggers on grove space', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'D39-truffle-slicer-before-place-farmer')!
    const player = createPlayer()
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('grove'),
      actionId: 'place-farmer',
      phase: 'before',
      result: { type: 'ok' },
    } as unknown as CardListenerContext))
    expect(result).toBeDefined()
    expect(result!.flow!.type).toBe('seq')
  })

  it('does not trigger on non-wood space', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'D39-truffle-slicer-before-place-farmer')!
    const player = createPlayer()
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('reed-bank'),
      actionId: 'place-farmer',
      phase: 'before',
      result: { type: 'ok' },
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('does not trigger when player has no boar', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'D39-truffle-slicer-before-place-farmer')!
    const player = createPlayer()
    player.resources.boar = 0
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'before',
      result: { type: 'ok' },
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

  it('does not trigger when player has no food', () => {
    const ruleRegistry = createOfficialCardRegistry()
    const listener = findListener(ruleRegistry, 'D39-truffle-slicer-before-place-farmer')!
    const player = createPlayer()
    player.resources.food = 0
    const result = withActiveRegistry(ruleRegistry, () => executeCardListener(listener, {
      state: createState(player),
      player,
      space: createSpace('forest'),
      actionId: 'place-farmer',
      phase: 'before',
      result: { type: 'ok' },
    } as unknown as CardListenerContext))
    expect(result).toBeUndefined()
  })

})

describe('ae-negative-35-placement', () => {
  const { sessions, save, ok, choose, pendingCard, trigger, finish, ready, action, buy, accept, bonus, truffle } = audit35Placement
  afterEach(() => sessions.splice(0).forEach(s => s.dispose()));
  it('D039 N1 actual round eight wood purchase and a real wood accumulation with a housed pig pay one food for exactly one bonus point', () => { const s = truffle(false), bought = finish(s, buy(s, 'D039_TruffleSlicer')); assert.equal(bought.state.players[0]!.resources.wood, 0); action(s, 1, 'reed-bank'); ready(s); const p = finish(s, ok(s.takeAction(0, 'forest')), 'D039_TruffleSlicer'), r = finish(s, accept(s, p, 'D039_TruffleSlicer')); assert.deepEqual([r.state.players[0]!.resources.food, r.state.players[0]!.resources.wood, bonus(r, 'D039_TruffleSlicer')], [0, 3, 1]); save('D039-N1', { bought, p, r }); });
  it('D039 N2 decline missing pig missing food and a held card cannot buy a free Truffle point while collecting wood', () => {
      const s = truffle(), p = trigger(s, finish(s, ok(s.takeAction(0, 'forest')), 'D039_TruffleSlicer'), 'D039_TruffleSlicer'), decline = finish(s, choose(s, p, o => o.value === '__skip__'));
      assert.equal(decline.state.players[0]!.resources.food, 1);
      assert.equal(bonus(decline, 'D039_TruffleSlicer'), 0);
      const rows = [];
      for (const [played, pig, food] of [[true, 0, 1], [true, 1, 0], [false, 1, 1]] as const) {
          const t = truffle(played, pig, food), q = finish(t, ok(t.takeAction(0, 'forest')), 'D039_TruffleSlicer'), r = finish(t, pendingCard(q, 'D039_TruffleSlicer') ? accept(t, q, 'D039_TruffleSlicer') : q);
          assert.equal(bonus(r, 'D039_TruffleSlicer'), 0);
          assert.equal(r.state.players[0]!.resources.food, food);
          rows.push({ q, r });
      }
      save('D039-N2', { p, decline, rows });
  });
  it('D039 N3 round seven and no wood prevent purchase and actual opponent wood collection or unrelated Reed cannot reward the owner', () => {
      const rows = [];
      for (const [round, wood] of [[7, 1], [8, 0]] as const) {
          const s = truffle(false, 1, 1, round, wood), p = buy(s, 'D039_TruffleSlicer'), bad = assertRejectedUnchanged(s, () => s.resolveChoice(0, 'D039_TruffleSlicer'));
          assert.ok(p.state.players[0]!.minorHand.includes('D039_TruffleSlicer'));
          rows.push({ p, bad });
      }
      const t = truffle(), first = action(t, 0, 'reed-bank'), opponent = action(t, 1, 'forest');
      assert.equal(bonus(opponent, 'D039_TruffleSlicer'), 0);
      assert.equal(opponent.state.players[0]!.resources.food, 1);
      save('D039-N3', { rows, first, opponent });
  });
})
