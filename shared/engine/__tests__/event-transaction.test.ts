import { describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../contract/types'
import { placeFarmerAction } from '../../actions/effects/place-farmer'
import { ActionNode, SequenceNode } from '../nodes'
import { markOptional } from '../engine-utils'
import {
  asActionSpace,
  makeEventTestEngine,
  makeEventTestState,
} from './event-test-helpers'

const emitWoodGain = (context: Parameters<ActionDefinition['execute']>[0], wood = 1) => {
  context.eventSink.emit({
    type: 'resource.moved',
    resources: { wood },
    from: { kind: 'supply' },
    to: { kind: 'player', playerId: context.player.id },
    reason: 'gain',
  })
}

const action = (
  id: string,
  execute: ActionDefinition['execute'],
  resolveChoice?: ActionDefinition['resolveChoice'],
): ActionDefinition => ({
  id,
  nameKey: `test.${id}`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute,
  resolveChoice,
})

describe('engine event transactions', () => {
  it('commits a successful leaf frame when the engine completes', () => {
    const collect = action('collect-wood-event', (context) => {
      emitWoodGain(context, 2)
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const { engine } = makeEventTestEngine([collect])
    const space = asActionSpace(collect)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('done')

    expect(state.events).toMatchObject([
      {
        seq: 1,
        id: '1',
        actorPlayerId: 'p1',
        sourceActionId: collect.id,
        type: 'resource.moved',
        resources: { wood: 2 },
      },
    ])
    expect(state.nextEventSeq).toBe(2)
  })

  it('rolls back a failed leaf frame without consuming event seq', () => {
    const fail = action('failed-event-leaf', (context) => {
      emitWoodGain(context)
      return { type: 'fail', logKey: 'log.buildRoomFail' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const { engine } = makeEventTestEngine([fail])
    const space = asActionSpace(fail)

    expect(engine.proceed({ state, player, space })).toMatchObject({
      type: 'ok',
      result: { type: 'fail' },
    })

    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
  })

  it('rolls back earlier successful leaf events when a later sequence leaf fails', () => {
    const first = action('sequence-first-event', (context) => {
      emitWoodGain(context)
      return { type: 'ok' }
    })
    const second = action('sequence-second-fail', (context) => {
      emitWoodGain(context)
      return { type: 'fail', logKey: 'log.buildRoomFail' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const root = new SequenceNode('sequence-root', [
      new ActionNode('action-sequence-first-event', first.id),
      new ActionNode('action-sequence-second-fail', second.id),
    ])
    const { engine } = makeEventTestEngine([first, second], root)
    const space = asActionSpace(first)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space })).toMatchObject({
      type: 'ok',
      result: { type: 'fail' },
    })

    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
  })

  it('does not append events when an optional leaf is skipped', () => {
    const optional = action('optional-event-leaf', (context) => {
      emitWoodGain(context)
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const root = markOptional(new ActionNode('optional-event-node', optional.id))
    const { engine } = makeEventTestEngine([optional], root)
    const space = asActionSpace(optional)

    expect(engine.proceed({ state, player, space }).type).toBe('choice')
    expect(engine.resolveChoice('__skip__', { state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('done')

    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
  })

  it('keeps pre-choice events uncommitted until resolveChoice succeeds', () => {
    const choose = action(
      'choice-event-action',
      (context) => {
        emitWoodGain(context)
        return {
          type: 'request',
          request: {
            kind: 'choice',
            options: [{ value: 'take', labelKey: 'test.take' }],
          },
        }
      },
      (context) => {
        emitWoodGain(context, 2)
        return { type: 'ok' }
      },
    )
    const state = makeEventTestState()
    const player = state.players[0]!
    const { engine } = makeEventTestEngine([choose])
    const space = asActionSpace(choose)

    expect(engine.proceed({ state, player, space }).type).toBe('choice')
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(engine.resolveChoice('take', { state, player, space }).type).toBe('ok')

    expect(state.events.map((event) => event.seq)).toEqual([1, 2])
    expect(state.events.map((event) => event.sourceActionId)).toEqual([
      choose.id,
      choose.id,
    ])
    expect(state.nextEventSeq).toBe(3)
  })

  it('commits event emitted from getBaseChoiceOptions single-option auto-resolve', () => {
    const autoChoice: ActionDefinition = {
      ...action(
        'auto-choice-event-action',
        () => ({ type: 'fail', logKey: 'log.shouldNotExecute' }),
        (context) => {
          emitWoodGain(context, 3)
          return { type: 'ok' }
        },
      ),
      getBaseChoiceOptions: () => [{ value: 'only', labelKey: 'test.only' }],
    }
    const state = makeEventTestState()
    const player = state.players[0]!
    const { engine } = makeEventTestEngine([autoChoice])
    const space = asActionSpace(autoChoice)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('done')

    expect(state.events).toMatchObject([
      {
        seq: 1,
        id: '1',
        actorPlayerId: 'p1',
        sourceActionId: autoChoice.id,
        type: 'resource.moved',
        resources: { wood: 3 },
      },
    ])
    expect(state.nextEventSeq).toBe(2)
  })

  it('keeps eventSink when place-farmer forwards to the target action space', () => {
    const target = action('target-space-event-action', (context) => {
      emitWoodGain(context, 4)
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const targetSpace = asActionSpace(target)
    targetSpace.id = 'target-space'
    state.actionSpaces = [targetSpace]
    const { engine } = makeEventTestEngine([placeFarmerAction, target])
    const space = asActionSpace(placeFarmerAction)

    expect(engine.proceed({ state, player, space }).type).toBe('choice')
    expect(engine.resolveChoice('target-space', { state, player, space }).type).toBe('ok')

    expect(state.events).toMatchObject([
      {
        seq: 1,
        id: '1',
        actorPlayerId: 'p1',
        sourceActionId: targetSpace.id,
        type: 'resource.moved',
        resources: { wood: 4 },
      },
    ])
    expect(state.nextEventSeq).toBe(2)
  })

  it('restores pending event transaction and derived log state across snapshot roundtrip', () => {
    const first = action('snapshot-first-event', (context) => {
      emitWoodGain(context)
      return { type: 'ok' }
    })
    const request = action(
      'snapshot-request-event',
      (context) => {
        emitWoodGain(context, 2)
        return {
          type: 'request',
          request: {
            kind: 'choice',
            options: [{ value: 'finish', labelKey: 'test.finish' }],
          },
        }
      },
      (context) => {
        emitWoodGain(context, 3)
        return { type: 'ok' }
      },
    )
    const state = makeEventTestState()
    const player = state.players[0]!
    const root = new SequenceNode('snapshot-sequence-root', [
      new ActionNode('action-snapshot-first-event', first.id),
      new ActionNode('action-snapshot-request-event', request.id),
    ])
    const { engine } = makeEventTestEngine([first, request], root)
    const space = asActionSpace(first)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('choice')
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)

    const snapshot = JSON.parse(JSON.stringify(engine.snapshot()))
    const { engine: restored, log } = makeEventTestEngine([first, request])
    restored.restore(snapshot)
    expect(restored.resolveChoice('finish', { state, player, space }).type).toBe('ok')

    expect(state.events.map((event) => event.seq)).toEqual([1, 2, 3])
    expect(state.events.map((event) => event.resources)).toEqual([
      { wood: 1 },
      { wood: 2 },
      { wood: 3 },
    ])
    expect(state.nextEventSeq).toBe(4)
    expect(log.all().filter((entry) => entry.key === 'log.actionDetail')).toHaveLength(3)
  })

  it('keeps non-JSON engine snapshots isolated from later derivation clearing', () => {
    const first = action('alias-snapshot-first-event', (context) => {
      emitWoodGain(context)
      return { type: 'ok' }
    })
    const request = action(
      'alias-snapshot-request-event',
      (context) => {
        emitWoodGain(context, 2)
        return {
          type: 'request',
          request: {
            kind: 'choice',
            options: [{ value: 'finish', labelKey: 'test.finish' }],
          },
        }
      },
      () => ({ type: 'ok', logKey: 'log.legacyEvent' }),
    )
    const state = makeEventTestState()
    const player = state.players[0]!
    const root = new SequenceNode('alias-snapshot-sequence-root', [
      new ActionNode('action-alias-snapshot-first-event', first.id),
      new ActionNode('action-alias-snapshot-request-event', request.id),
    ])
    const { engine } = makeEventTestEngine([first, request], root)
    const space = asActionSpace(first)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('choice')

    const snapshot = engine.snapshot()
    const restoredState = JSON.parse(JSON.stringify(state)) as typeof state
    const restoredPlayer = restoredState.players[0]!

    expect(engine.resolveChoice('finish', { state, player, space }).type).toBe('ok')

    const { engine: restored, log: restoredLog } = makeEventTestEngine([first, request])
    restored.restore(snapshot)
    expect(restored.resolveChoice('finish', {
      state: restoredState,
      player: restoredPlayer,
      space,
    }).type).toBe('ok')

    expect(restoredLog.all().filter((entry) => entry.key === 'log.actionDetail')).toHaveLength(2)
  })

  it('keeps a recoverable resolveChoice failure transaction open for a later successful resolve', () => {
    const choose = action(
      'recoverable-choice-event',
      (context) => {
        emitWoodGain(context)
        return {
          type: 'request',
          request: {
            kind: 'choice',
            options: [
              { value: 'bad', labelKey: 'test.bad' },
              { value: 'good', labelKey: 'test.good' },
            ],
          },
        }
      },
      (context, choice) => {
        emitWoodGain(context, choice === 'bad' ? 9 : 2)
        return choice === 'bad'
          ? { type: 'fail', logKey: 'log.buildRoomFail', recoverable: true }
          : { type: 'ok' }
      },
    )
    const state = makeEventTestState()
    const player = state.players[0]!
    const { engine } = makeEventTestEngine([choose])
    const space = asActionSpace(choose)

    expect(engine.proceed({ state, player, space }).type).toBe('choice')
    expect(engine.resolveChoice('bad', { state, player, space })).toMatchObject({
      type: 'fail',
      recoverable: true,
    })
    expect(state.events).toEqual([])
    expect(state.nextEventSeq).toBe(1)
    expect(engine.resolveChoice('good', { state, player, space }).type).toBe('ok')

    expect(state.events.map((event) => event.seq)).toEqual([1, 2])
    expect(state.events.map((event) => event.resources)).toEqual([
      { wood: 1 },
      { wood: 2 },
    ])
    expect(state.nextEventSeq).toBe(3)
  })

  it('derives logs for event-only results but not for legacy log results', () => {
    const eventOnly = action('event-only-log', (context) => {
      emitWoodGain(context)
      return { type: 'ok' }
    })
    const legacy = action('legacy-log-event', (context) => {
      emitWoodGain(context)
      return { type: 'ok', logKey: 'log.legacyEvent' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    const root = new SequenceNode('log-sequence-root', [
      new ActionNode('action-event-only-log', eventOnly.id),
      new ActionNode('action-legacy-log-event', legacy.id),
    ])
    const { engine, log } = makeEventTestEngine([eventOnly, legacy], root)
    const space = asActionSpace(eventOnly)

    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('ok')
    expect(engine.proceed({ state, player, space }).type).toBe('done')

    expect(log.all().filter((entry) => entry.key === 'log.actionDetail')).toHaveLength(1)
    expect(log.all().some((entry) => entry.key === 'log.action')).toBe(false)
    expect(log.all().some((entry) => entry.key === 'log.legacyEvent')).toBe(true)
  })
})
