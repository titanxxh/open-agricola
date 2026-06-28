import { afterEach, describe, expect, it } from 'vitest'
import type { ActionDefinition } from '../../contract/types'
import { withActiveRegistry } from '../../cards/active-registry'
import { CardRegistry } from '../../cards/registry'
import { collectTriggerCardsAs } from '../../cards/helpers/trigger-snapshot'
import { ActionNode } from '../nodes'
import { Engine } from '../engine'
import { EngineTree } from '../tree'
import { HookDispatcher } from '../dispatcher'
import { LogStore } from '../log-store'
import { ensureCatalogLookupsInstalled } from '../../cards/install-catalog-lookups'
import {
  asActionSpace,
  makeEventTestEngine,
  makeEventTestState,
} from './event-test-helpers'
import '../../cards/A/A085_Homekeeper'
import '../../cards/A/A114_SeasonalWorker'
import '../../cards/A/A118_Treegardener'
import '../../cards/B/B049_Scales'
import '../../cards/B/B082_ValueAssets'
import '../../cards/D/D042_EducationBonus'
import '../../cards/E/E089_Stallwright'
import '../../cards/E/E097_Beneficiary'

ensureCatalogLookupsInstalled()

const action = (
  id: string,
  execute: ActionDefinition['execute'],
): ActionDefinition => ({
  id,
  nameKey: `test.${id}`,
  descriptionKey: `test.${id}.description`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute,
})

describe('trailing trigger snapshots', () => {
  afterEach(() => {
    withActiveRegistry(new CardRegistry(), () => undefined)
  })

  it('stores trigger-time played-card lists and counts on trailing activation nodes', () => {
    const trigger = action('trigger-snapshot-host', (context) => {
      context.player.occupationPlayed.push('A114_SeasonalWorker')
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    player.occupationPlayed = ['E089_Stallwright']
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'trigger-snapshot-observer',
      cardIds: ['E089_Stallwright'],
      actions: [trigger.id],
      phases: ['after'],
      handler: () => undefined,
    })
    const { engine } = makeEventTestEngine([trigger])

    withActiveRegistry(registry, () => {
      expect(engine.proceed({ state, player, space: asActionSpace(trigger) }).type).toBe('ok')
    })

    const activation = engine
      ._internals()
      .tree
      .allNodes()
      .filter((node): node is ActionNode => node instanceof ActionNode)
      .find((node) => node.actionId === 'activate-card')

    expect(activation?.params?.triggerSnapshot).toMatchObject({
      players: {
        [player.id]: {
          occupation: ['E089_Stallwright', 'A114_SeasonalWorker'],
          counts: { occupation: 2 },
        },
      },
    })
  })

  it('listener helpers read trigger-time counts after an earlier listener mutates live state', () => {
    const trigger = action('trigger-snapshot-mutation-host', (context) => {
      context.player.occupationPlayed.push('A114_SeasonalWorker')
      return { type: 'ok' }
    })
    const appendOccupation = action('append-live-occupation', (context) => {
      context.player.occupationPlayed.push('E097_Beneficiary')
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    player.occupationPlayed = ['A085_Homekeeper', 'E089_Stallwright']
    const observed: Array<{ snapshot: number; live: number }> = []
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'trigger-snapshot-mutator',
      cardIds: ['A085_Homekeeper'],
      actions: [trigger.id],
      phases: ['after'],
      order: 10,
      handler: () => ({
        flow: { type: 'leaf', actionId: appendOccupation.id },
      }),
    })
    registry.registerListener({
      id: 'trigger-snapshot-observer',
      cardIds: ['E089_Stallwright'],
      actions: [trigger.id],
      phases: ['after'],
      handler: (context) => {
        observed.push({
          snapshot: collectTriggerCardsAs(context, context.player, 'occupation').length,
          live: context.player.occupationPlayed.length,
        })
      },
    })
    const { engine } = makeEventTestEngine([trigger, appendOccupation])

    withActiveRegistry(registry, () => {
      for (let i = 0; i < 10 && observed.length === 0; i += 1) {
        const step = engine.proceed({ state, player, space: asActionSpace(trigger) })
        expect(step.type).not.toBe('blocked')
      }
    })

    expect(observed).toEqual([{ snapshot: 3, live: 4 }])
  })

  it('restores trailing trigger snapshots from the cursor instead of live state', () => {
    const trigger = action('trigger-snapshot-cursor-host', (context) => {
      context.player.occupationPlayed.push('A114_SeasonalWorker')
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    player.occupationPlayed = ['A085_Homekeeper']
    const observed: number[] = []
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'trigger-snapshot-cursor-observer',
      cardIds: ['A085_Homekeeper'],
      actions: [trigger.id],
      phases: ['after'],
      handler: (context) => {
        observed.push(collectTriggerCardsAs(context, context.player, 'occupation').length)
      },
    })
    const { engine } = makeEventTestEngine([trigger])

    withActiveRegistry(registry, () => {
      expect(engine.proceed({ state, player, space: asActionSpace(trigger) }).type).toBe('ok')
    })

    const snapshot = engine.snapshot()
    player.occupationPlayed.push('E097_Beneficiary')
    const restored = new Engine({
      tree: new EngineTree(new ActionNode('dummy', trigger.id)),
      registry: engine._internals().registry,
      hooks: new HookDispatcher(),
      log: new LogStore(),
    })
    restored.restore(snapshot)

    withActiveRegistry(registry, () => {
      expect(restored.proceed({ state, player, space: asActionSpace(trigger) }).type).toBe('ok')
    })

    expect(observed).toEqual([2])
  })

  it('executes matched listeners even if an earlier listener moves the owner card out of its trigger zone', () => {
    const trigger = action('trigger-snapshot-zone-host', () => ({ type: 'ok' }))
    const moveObserver = action('move-observer-card', (context) => {
      context.player.minorPlayed = context.player.minorPlayed.filter((id) => id !== 'B082_ValueAssets')
      context.player.minorHand.push('B082_ValueAssets')
      return { type: 'ok' }
    })
    const state = makeEventTestState()
    const player = state.players[0]!
    player.minorPlayed = ['B049_Scales', 'B082_ValueAssets']
    const seenZones: Array<string | undefined> = []
    const registry = new CardRegistry()
    registry.registerListener({
      id: 'trigger-snapshot-zone-mutator',
      cardIds: ['B049_Scales'],
      actions: [trigger.id],
      phases: ['after'],
      order: 10,
      handler: () => ({
        flow: { type: 'leaf', actionId: moveObserver.id },
      }),
    })
    registry.registerListener({
      id: 'trigger-snapshot-zone-observer',
      cardIds: ['B082_ValueAssets'],
      actions: [trigger.id],
      phases: ['after'],
      handler: (context) => {
        seenZones.push(context.ownerCardZone)
      },
    })
    const { engine } = makeEventTestEngine([trigger, moveObserver])

    withActiveRegistry(registry, () => {
      for (let i = 0; i < 10 && seenZones.length === 0; i += 1) {
        const step = engine.proceed({ state, player, space: asActionSpace(trigger) })
        expect(step.type).not.toBe('blocked')
      }
    })

    expect(seenZones).toEqual(['played'])
    expect(player.minorPlayed).not.toContain('B082_ValueAssets')
    expect(player.minorHand).toContain('B082_ValueAssets')
  })
})
