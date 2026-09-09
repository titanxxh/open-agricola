import { beforeEach, describe, expect, it } from 'vitest'
import type {
  ActionChoiceOption,
  ActionDefinition,
  ActionSpace,
  GameState,
  PlayerState,
} from '../../contract/types'
import { ActionRegistry } from '../registry'
import { CardRegistry } from '../../cards/registry'
import { setActiveCardRegistry, requireActiveCardRegistry } from '../../cards/active-registry'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ActionNode, SequenceNode, OrNode, XorNode } from '../nodes'
import { clearActionHooks } from '../../actions/hooks'

const createState = () =>
  ({
    round: 1,
    currentPlayerIndex: 0,
    players: [],
    actionSpaces: [],
    log: [],
    roundStartSnapshot: null,
    roundActionOrder: Array.from({ length: 14 }).map(() => null),
    gameSeed: 1,
    availableMajorImprovements: [],
    futureMeeples: [],
    pendingFutureMeeples: [],
    gameOver: false,
  }) as GameState

const createPlayer = () =>
  ({
    id: 'p1', name: 'P1', color: 'red',
    resources: {
      wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
      grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
    },
    workers: [
      { id: '1', isActive: true, isNewborn: false },
      { id: '2', isActive: true, isNewborn: false },
    ],
    rooms: 2, houseType: 'wood',
    fields: [], fences: 0, roomTiles: [], stableTiles: [],
    improvements: [], minorHand: [], minorPlayed: [],
    occupationHand: [], occupationPlayed: [],houseAnimalType: null, houseAnimalCount: 0, stableAnimals: {},
    pastures: [], fenceSegments: [],
    majorEffects: { wellRounds: 0 }, startPlayer: false,
  }) as PlayerState

const createSpace = (action: ActionDefinition): ActionSpace => ({
  ...action,
  resources: {
    wood: 0, clay: 0, reed: 0, stone: 0, food: 0,
    grain: 0, vegetable: 0, sheep: 0, boar: 0, cattle: 0, begging: 0,
  },
  takenBy: [],
})

const buildEngine = (action: ActionDefinition, withChoice = true) => {
  const registry = new ActionRegistry()
  registry.register(action)
  const root = withChoice
    ? new SequenceNode(`sequence-${action.id}`, [
        new ActionNode(`action-${action.id}`, action.id),
      ])
    : new ActionNode(`action-${action.id}`, action.id)
  const log = new LogStore()
  const engine = new Engine({
    tree: new EngineTree(root),
    registry,
    hooks: new HookDispatcher(),
    log,
  })
  return { engine, log }
}

const buildOptInAction = (
  baseOptions: ActionChoiceOption[],
  resolveCalls: { value: string; params: Record<string, unknown> | undefined }[],
): ActionDefinition => ({
  id: 'opt-in-choice-action',
  nameKey: 'test', descriptionKey: 'test',
  roundAvailable: 1, gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  costPreview: {
    isStructurallyPossible: () => true,
    canExecute: (_ctx, _override) => true,
    getBaseCost: () => ({}),
  },
  getBaseChoiceOptions: () => baseOptions,
  choicePromptKey: 'ui.testPrompt',
  noChoiceLogKey: 'log.testNoChoice',
  execute: () => ({ type: 'fail', errorKey: 'log.testNoChoice' }),
  resolveChoice: ({ params }, choice) => {
    resolveCalls.push({ value: choice, params })
    return { type: 'ok' }
  },
})

describe('Engine — getBaseChoiceOptions opt-in flow', () => {
  beforeEach(() => {
    clearActionHooks()
    setActiveCardRegistry(new CardRegistry())
  })

  for (const Composite of [OrNode, XorNode]) {
    it.each([0, 1, 2])(`${Composite.name} uses candidate filtering after branch selection (%i options)`, (count) => {
      const calls: { value: string; params: Record<string, unknown> | undefined }[] = []
      const action = buildOptInAction([
        { value: 'first', labelKey: 'first' },
        { value: 'second', labelKey: 'second' },
      ], calls)
      action.costPreview = {
        isStructurallyPossible: () => true,
        canExecute: (context) => context.params?.selectedOption === undefined
          || context.params.selectedOption === 'first' && count > 0
          || context.params.selectedOption === 'second' && count > 1,
        getBaseCost: () => ({}),
      }
      const registry = new ActionRegistry()
      registry.register(action)
      registry.register({ ...action, id: 'alternative', getBaseChoiceOptions: undefined, execute: () => ({ type: 'ok' }) })
      const engine = new Engine({
        tree: new EngineTree(new Composite('root', [
          new ActionNode('selected', action.id), new ActionNode('alternative', 'alternative'),
        ])),
        registry, hooks: new HookDispatcher(), log: new LogStore(),
      })
      const context = { state: createState(), player: createPlayer(), space: createSpace(action) }
      expect(engine.proceed(context).type).toBe('choice')
      const before = engine.snapshot()
      const result = engine.resolveChoice('selected', context)
      if (count === 0) {
        expect(result.type).toBe('fail')
        expect(calls).toHaveLength(0)
      } else if (count === 1) {
        expect(result.type).toBe('ok')
        expect(calls).toEqual([{ value: 'first', params: { selectedOption: 'first' } }])
      } else {
        expect(result.type).toBe('request')
        const pending = engine.snapshot()
        engine.restore(pending)
        expect(engine.resolveChoice('second', context).type).toBe('ok')
        expect(calls[0]!.value).toBe('second')
      }
      engine.restore(before)
      expect(engine.proceed(context).type).toBe('choice')
    })
  }

  it('auto-resolves silently when only one base option is affordable (no UI prompt)', () => {
    const resolveCalls: { value: string; params: Record<string, unknown> | undefined }[] = []
    const action = buildOptInAction(
      [{ value: 'only', labelKey: 'l' }],
      resolveCalls,
    )
    const { engine } = buildEngine(action, false)
    const ctx = { state: createState(), player: createPlayer(), space: createSpace(action) }

    const step = engine.proceed(ctx)

    expect(step.type).toBe('ok')
    expect(resolveCalls).toHaveLength(1)
    expect(resolveCalls[0]!.value).toBe('only')
    expect(resolveCalls[0]!.params?.selectedOption).toBe('only')
  })

  it('recomputes computeCosts with selectedOption before auto-resolved resolveChoice', () => {
    requireActiveCardRegistry('engine-choice-candidates').registerListener({
      id: 'test-selected-costs',
      actions: ['opt-in-choice-action'],
      phases: ['computeCosts'],
      handler: (ctx) => ctx.params?.selectedOption === 'stone'
        ? {
            costs: { stone: -2 },
            bonuses: [{ discount: { stone: 2 }, optional: false, sources: ['TestCard'] }],
          }
        : { costs: { clay: 1 } },
    })
    const resolveCalls: Array<{
      value: string
      params: Record<string, unknown> | undefined
      costs: Record<string, unknown> | undefined
      costBonuses: unknown
    }> = []
    const action: ActionDefinition = {
      ...buildOptInAction([{ value: 'stone', labelKey: 'stone' }], []),
      resolveChoice: ({ params, costs, costBonuses }, choice) => {
        resolveCalls.push({ value: choice, params, costs, costBonuses })
        return { type: 'ok' }
      },
    }
    const { engine } = buildEngine(action, false)
    const ctx = { state: createState(), player: createPlayer(), space: createSpace(action) }

    engine.proceed(ctx)

    expect(resolveCalls).toHaveLength(1)
    expect(resolveCalls[0]!.params?.selectedOption).toBe('stone')
    expect(resolveCalls[0]!.costs).toEqual({ stone: -2 })
    expect(resolveCalls[0]!.costBonuses).toEqual([
      { discount: { stone: 2 }, optional: false, sources: ['TestCard'] },
    ])
  })

  it('presents a choice when ≥2 affordable options after merging hook extras', () => {
    requireActiveCardRegistry('engine-choice-candidates').registerListener({
      id: 'test-extra-option',
      actions: ['opt-in-choice-action'],
      phases: ['computeChoiceCandidates'],
      handler: () => ({
        extraOptions: [{ value: 'extra', labelKey: 'extra-label' }],
      }),
    })
    const resolveCalls: { value: string; params: Record<string, unknown> | undefined }[] = []
    const action = buildOptInAction(
      [{ value: 'base', labelKey: 'base-label' }],
      resolveCalls,
    )
    const { engine } = buildEngine(action, true)
    const ctx = { state: createState(), player: createPlayer(), space: createSpace(action) }

    const step = engine.proceed(ctx)
    expect(step.type).toBe('choice')
    expect(step.choice?.promptKey).toBe('ui.testPrompt')
    expect(step.choice?.options).toEqual([
      { value: 'base', labelKey: 'base-label' },
      { value: 'extra', labelKey: 'extra-label' },
    ])
    expect(resolveCalls).toHaveLength(0)

    const resolved = engine.resolveChoice('extra', ctx)
    expect(resolved.type).toBe('ok')
    expect(resolveCalls).toHaveLength(1)
    expect(resolveCalls[0]!.value).toBe('extra')
    expect(resolveCalls[0]!.params?.selectedOption).toBe('extra')
  })

  it('returns fail (using noChoiceLogKey) when no candidate is affordable for any selected option', () => {
    const resolveCalls: { value: string; params: Record<string, unknown> | undefined }[] = []
    const action: ActionDefinition = {
      ...buildOptInAction([{ value: 'unaffordable', labelKey: 'l' }], resolveCalls),
      costPreview: {
        isStructurallyPossible: () => true,
        // Top-level (no selectedOption) doable check passes; per-option check rejects all candidates.
        canExecute: (ctx) => ctx.params?.selectedOption == null,
        getBaseCost: () => ({}),
      },
    }
    const { engine } = buildEngine(action, false)
    const ctx = { state: createState(), player: createPlayer(), space: createSpace(action) }

    const step = engine.proceed(ctx)

    expect(resolveCalls).toHaveLength(0)
    expect(step.result).toEqual({ type: 'fail', errorKey: 'log.testNoChoice' })
  })

  it('dedups duplicate option values (first wins) so listeners cannot override base labels', () => {
    requireActiveCardRegistry('engine-choice-candidates').registerListener({
      id: 'test-duplicate-option',
      actions: ['opt-in-choice-action'],
      phases: ['computeChoiceCandidates'],
      handler: () => ({
        extraOptions: [{ value: 'shared', labelKey: 'extra-shared-label' }],
      }),
    })
    const resolveCalls: { value: string; params: Record<string, unknown> | undefined }[] = []
    const action = buildOptInAction(
      [{ value: 'shared', labelKey: 'base-shared-label' }],
      resolveCalls,
    )
    const { engine } = buildEngine(action, false)
    const ctx = { state: createState(), player: createPlayer(), space: createSpace(action) }

    const step = engine.proceed(ctx)

    expect(step.type).toBe('ok')
    expect(resolveCalls).toHaveLength(1)
    expect(resolveCalls[0]!.value).toBe('shared')
  })

  it('filters unaffordable options out via per-option canExecute(params.selectedOption)', () => {
    requireActiveCardRegistry('engine-choice-candidates').registerListener({
      id: 'test-affordable-extra',
      actions: ['opt-in-choice-action'],
      phases: ['computeChoiceCandidates'],
      handler: () => ({
        extraOptions: [{ value: 'rich', labelKey: 'rich' }],
      }),
    })
    const resolveCalls: { value: string; params: Record<string, unknown> | undefined }[] = []
    const action: ActionDefinition = {
      ...buildOptInAction(
        [{ value: 'poor', labelKey: 'poor' }],
        resolveCalls,
      ),
      costPreview: {
        isStructurallyPossible: () => true,
        canExecute: (ctx) => {
          const sel = ctx.params?.selectedOption
          if (sel == null) return true
          return sel === 'rich'
        },
        getBaseCost: () => ({}),
      },
    }
    const { engine } = buildEngine(action, false)
    const ctx = { state: createState(), player: createPlayer(), space: createSpace(action) }

    engine.proceed(ctx)

    expect(resolveCalls).toHaveLength(1)
    expect(resolveCalls[0]!.value).toBe('rich')
    expect(resolveCalls[0]!.params?.selectedOption).toBe('rich')
  })
})
