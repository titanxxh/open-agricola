import { readdirSync, readFileSync } from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
import { eventsToLogEntries } from '../log-mapper'
import { isPublicEventReplayable, privateEventMappingPolicy, publicEventMappingPolicy } from '../event-mapping-policy'
import type { GameEvent } from '../../contract/events'
import type { PrivateGameEvent } from '../../contract/private-events'

const expectedPublicEventTypes = [
  'action.accumulated',
  'action.detailLogged',
  'action.exclusiveUseCleared',
  'action.exclusiveUseSet',
  'action.granted',
  'action.revealed',
  'card.destroyed',
  'card.infoboxChanged',
  'card.passed',
  'card.played',
  'card.returnedToBoard',
  'card.resourcePairsStored',
  'card.stackChanged',
  'card.stateChanged',
  'card.swappedWithBoard',
  'card.triggered',
  'farm.animalBred',
  'farm.animalDiscarded',
  'farm.animalMoved',
  'farm.cropAdded',
  'farm.cropRemoved',
  'farm.fenceBuilt',
  'farm.fenceConsumed',
  'farm.fieldPlowed',
  'farm.renovated',
  'farm.roomBuilt',
  'farm.sown',
  'farm.stableBuilt',
  'futureMeeple.queued',
  'futureMeeple.removed',
  'futureMeeple.resolved',
  'game.ended',
  'game.started',
  'harvest.feedConverted',
  'harvest.heated',
  'harvest.phaseStarted',
  'harvest.reapNothing',
  'harvest.reapSkipped',
  'harvest.started',
  'parent.motherScheduled',
  'resource.accumulated',
  'resource.exchanged',
  'resource.moved',
  'resource.paid',
  'returnHome.started',
  'round.started',
  'startPlayer.changed',
  'turn.skipped',
  'work.started',
  'worker.placed',
  'worker.promoted',
  'worker.returned',
] as const satisfies readonly GameEvent['type'][]

type MissingPublicEventType = Exclude<GameEvent['type'], typeof expectedPublicEventTypes[number]>
const noMissingPublicEventTypes: Record<MissingPublicEventType, never> = {}

const expectedPrivateEventTypes = [
  'private.draftUpdated',
  'private.handChanged',
  'private.promptShown',
] as const satisfies readonly PrivateGameEvent['type'][]

type MissingPrivateEventType = Exclude<PrivateGameEvent['type'], typeof expectedPrivateEventTypes[number]>
const noMissingPrivateEventTypes: Record<MissingPrivateEventType, never> = {}

const base = {
  schemaVersion: 1,
  id: 'evt',
  seq: 1,
  round: 1,
  phase: 'work',
  visibility: 'public',
  actorPlayerId: 'p1',
} as const

type PublicConsumerSurface = 'log' | 'notification' | 'highlight' | 'resourceAnimation'
type PublicConsumerFixtures = {
  mapped?: GameEvent
  silent?: GameEvent
}
type PublicEventFixtureMatrix = Record<GameEvent['type'], Partial<Record<PublicConsumerSurface, PublicConsumerFixtures>>>

const toRepoPath = (filePath: string): string =>
  path.relative(process.cwd(), filePath).split(path.sep).join('/')

const findCardPassedReferences = (): string[] => {
  const matches: string[] = []
  const testFilePath = 'shared/events/__tests__/event-mapping-policy.test.ts'
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(fullPath)
        continue
      }
      if (!entry.isFile() || (!entry.name.endsWith('.ts') && !entry.name.endsWith('.tsx'))) continue

      const repoPath = toRepoPath(fullPath)
      if (repoPath === testFilePath) continue

      readFileSync(fullPath, 'utf8').split(/\r?\n/).forEach((line, index) => {
        if (line.includes('card.passed')) matches.push(`${repoPath}:${index + 1}:${line}`)
      })
    }
  }

  for (const root of ['shared', 'server', 'client']) {
    visit(path.join(process.cwd(), root))
  }
  return matches
}

const publicEventFixtureMatrix = {
  'resource.moved': {
    log: {
      mapped: { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' },
      silent: { ...base, id: 'resource-moved-card', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'card', cardId: 'A001_Test' }, to: { kind: 'card', cardId: 'A002_Test' }, reason: 'cardEffect' },
    },
    highlight: {
      mapped: { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'actionSpace', spaceId: 'forest' }, to: { kind: 'player', playerId: 'p1' }, reason: 'collect' },
      silent: { ...base, id: 'resource-moved-no-action', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' },
      silent: { ...base, id: 'resource-moved-card-animation', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'card', cardId: 'A001_Test' }, to: { kind: 'card', cardId: 'A002_Test' }, reason: 'cardEffect' },
    },
  },
  'resource.exchanged': {
    highlight: {
      mapped: { ...base, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'actionSpace', spaceId: 'grain-utilization' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' } },
      silent: { ...base, id: 'exchange-no-action', seq: 2, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'player', playerId: 'p1' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' } },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'player', playerId: 'p1' }, paidTo: { kind: 'supply' }, gainedFrom: { kind: 'supply' }, gainedTo: { kind: 'player', playerId: 'p1' } },
      silent: { ...base, id: 'exchange-card-endpoints', seq: 2, type: 'resource.exchanged', paid: { grain: 1 }, gained: { food: 2 }, paidFrom: { kind: 'card', cardId: 'A001_Test' }, paidTo: { kind: 'card', cardId: 'A002_Test' }, gainedFrom: { kind: 'card', cardId: 'A003_Test' }, gainedTo: { kind: 'roundCard', round: 3 } },
    },
  },
  'resource.accumulated': {
    log: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-empty-log', seq: 2, type: 'resource.accumulated', resources: { food: 0 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
    },
    notification: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-silent', seq: 2, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' }, silent: true },
    },
    highlight: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-card-highlight', seq: 2, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'card', cardId: 'B048_ForestStone' } },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'actionSpace', spaceId: 'fishing' } },
      silent: { ...base, id: 'resource-accumulated-card-animation', seq: 2, type: 'resource.accumulated', resources: { food: 1 }, to: { kind: 'card', cardId: 'B048_ForestStone' } },
    },
  },
  'resource.paid': {
    notification: {
      mapped: { ...base, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'room' },
      silent: { ...base, id: 'paid-empty-notification', seq: 2, type: 'resource.paid', resources: {}, paymentFor: 'bonus', bonusSources: ['A001_Test'] },
    },
    highlight: {
      mapped: { ...base, type: 'resource.paid', sourceActionId: 'construct', resources: { wood: 1 }, paymentFor: 'room' },
      silent: { ...base, id: 'paid-no-action', seq: 2, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'bonus' },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'room' },
      silent: { ...base, id: 'paid-no-actor', seq: 2, actorPlayerId: undefined, type: 'resource.paid', resources: { wood: 1 }, paymentFor: 'bonus' },
    },
  },
  'farm.sown': {
    highlight: {
      mapped: { ...base, type: 'farm.sown', sows: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', added: 2 }] },
      silent: { ...base, id: 'sown-card', seq: 2, type: 'farm.sown', sows: [{ location: { kind: 'card', cardId: 'A001_Test' }, crop: 'grain', added: 2 }] },
    },
  },
  'farm.cropAdded': {
    highlight: {
      mapped: { ...base, type: 'farm.cropAdded', crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
      silent: { ...base, id: 'crop-added-card', seq: 2, type: 'farm.cropAdded', crops: [{ location: { kind: 'card', cardId: 'A001_Test' }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
    },
  },
  'farm.cropRemoved': {
    highlight: {
      mapped: { ...base, type: 'farm.cropRemoved', crops: [{ location: { kind: 'field', playerId: 'p1', row: 0, col: 1 }, crop: 'grain', amount: 1 }], reason: 'harvest' },
      silent: { ...base, id: 'crop-removed-card', seq: 2, type: 'farm.cropRemoved', crops: [{ location: { kind: 'card', cardId: 'A001_Test' }, crop: 'grain', amount: 1 }], reason: 'cardEffect' },
    },
  },
  'farm.fieldPlowed': {
    highlight: {
      mapped: { ...base, type: 'farm.fieldPlowed', fields: [{ playerId: 'p1', row: 1, col: 1 }] },
      silent: { ...base, id: 'plowed-empty', seq: 2, type: 'farm.fieldPlowed', fields: [] },
    },
  },
  'farm.roomBuilt': {
    highlight: {
      mapped: { ...base, type: 'farm.roomBuilt', rooms: [{ playerId: 'p1', row: 1, col: 1, type: 'wood' }] },
      silent: { ...base, id: 'room-empty', seq: 2, type: 'farm.roomBuilt', rooms: [] },
    },
  },
  'farm.renovated': {
    highlight: {
      mapped: { ...base, type: 'farm.renovated', playerId: 'p1', from: 'wood', to: 'clay', rooms: [{ row: 1, col: 1 }] },
      silent: { ...base, id: 'renovated-empty', seq: 2, type: 'farm.renovated', playerId: 'p1', from: 'wood', to: 'clay', rooms: [] },
    },
  },
  'farm.stableBuilt': {
    highlight: {
      mapped: { ...base, type: 'farm.stableBuilt', stables: [{ playerId: 'p1', row: 1, col: 1 }] },
      silent: { ...base, id: 'stable-empty', seq: 2, type: 'farm.stableBuilt', stables: [] },
    },
  },
  'farm.fenceBuilt': {
    log: {
      mapped: { ...base, type: 'farm.fenceBuilt', fences: [{ type: 'fence', edge: 'h-0-0' }] },
      silent: { ...base, id: 'fence-no-count', seq: 2, type: 'farm.fenceBuilt', fences: [{ type: 'marker', edge: 'h-0-0' }] },
    },
    highlight: {
      mapped: { ...base, type: 'farm.fenceBuilt', fences: [], newFenceEdges: ['h-0-0'] },
      silent: { ...base, id: 'fence-no-owner', seq: 2, actorPlayerId: undefined, type: 'farm.fenceBuilt', fences: [], newFenceEdges: ['h-0-0'] },
    },
  },
  'farm.animalBred': {
    log: {
      mapped: { ...base, type: 'farm.animalBred', animals: { sheep: 1 }, source: 'harvest' },
      silent: { ...base, id: 'animal-bred-card-effect', seq: 2, type: 'farm.animalBred', animals: { sheep: 1 }, source: 'cardEffect' },
    },
  },
  'action.accumulated': {
    log: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-log', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
    notification: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-notification', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
    highlight: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-highlight', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
    resourceAnimation: {
      mapped: { ...base, type: 'action.accumulated', spaceId: 'forest', resources: { wood: 1 } },
      silent: { ...base, id: 'action-accumulated-empty-animation', seq: 2, type: 'action.accumulated', spaceId: 'forest', resources: {} },
    },
  },
  'card.stackChanged': {
    notification: {
      mapped: { ...base, type: 'card.stackChanged', cardId: 'C081_MaterialHub', targetPlayerId: 'p1', resources: { wood: 2 }, delta: 2, reason: 'store' },
      silent: { ...base, id: 'stack-empty', seq: 2, type: 'card.stackChanged', cardId: 'C081_MaterialHub', targetPlayerId: 'p1', resources: {}, reason: 'store' },
    },
  },
  'futureMeeple.queued': {
    log: {
      mapped: { ...base, type: 'futureMeeple.queued', playerId: 'p1', cardId: 'B157_Salter', entries: [{ round: 3, resources: { food: 2 } }], sourceSummary: { key: 'log.salterFutureFood', params: { cardId: 'B157_Salter', animals: '1 sheep', sheep: 1, boar: 0, cattle: 0, futureFood: 3, schedule: '2 food in round 3' } } },
      silent: { ...base, id: 'future-queued-no-summary', seq: 2, type: 'futureMeeple.queued', playerId: 'p1', cardId: 'B157_Salter', entries: [{ round: 3, resources: { food: 2 } }] },
    },
  },
  'futureMeeple.resolved': {
    log: {
      mapped: { ...base, type: 'futureMeeple.resolved', playerId: 'p1', cardId: 'B157_Salter', round: 3, resources: { food: 2 }, roomType: 'clay' },
      silent: { ...base, id: 'future-resolved-resource', seq: 2, type: 'futureMeeple.resolved', playerId: 'p1', cardId: 'PR11', round: 3, resources: { food: 1 } },
    },
  },
} satisfies Partial<PublicEventFixtureMatrix>

describe('event mapping policy', () => {
  it('covers every current public event type', () => {
    expect(noMissingPublicEventTypes).toEqual({})
    expect(Object.keys(publicEventMappingPolicy).sort()).toEqual([...expectedPublicEventTypes].sort())
  })

  it('covers every current private event type', () => {
    expect(noMissingPrivateEventTypes).toEqual({})
    expect(Object.keys(privateEventMappingPolicy).sort()).toEqual([...expectedPrivateEventTypes].sort())
  })

  it('requires reasons for silent or conditional consumer surfaces', () => {
    for (const [type, policy] of Object.entries(publicEventMappingPolicy)) {
      for (const surface of ['log', 'notification', 'highlight', 'resourceAnimation'] as const) {
        const consumer = policy[surface]
        if (consumer.mode === 'silent' || consumer.mode === 'conditional') {
          expect(consumer.silentReason, `${type}.${surface}`).toBeTruthy()
        }
        if (consumer.mode === 'conditional') {
          expect(consumer.condition, `${type}.${surface}`).toBeTruthy()
        }
      }
    }
  })

  it('keeps replay helper aligned with metadata-only policy entries', () => {
    const replayable = { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' } satisfies GameEvent
    const metadataOnly = { ...base, type: 'card.stateChanged', cardId: 'B021_HayloftBarn', key: 'food', value: 3, targetPlayerId: 'p1' } satisfies GameEvent

    expect(publicEventMappingPolicy[replayable.type].replay).toBe('replayable')
    expect(isPublicEventReplayable(replayable)).toBe(true)
    expect(publicEventMappingPolicy[metadataOnly.type].replay).toBe('metadataOnly')
    expect(isPublicEventReplayable(metadataOnly)).toBe(false)
  })

  it('documents conditional log mapping for existing event shapes', () => {
    const playerGain = { ...base, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'supply' }, to: { kind: 'player', playerId: 'p1' }, reason: 'gain' } satisfies GameEvent
    const cardMove = { ...base, id: 'evt-2', seq: 2, type: 'resource.moved', resources: { wood: 1 }, from: { kind: 'card', cardId: 'A001_Test' }, to: { kind: 'card', cardId: 'A002_Test' }, reason: 'cardEffect' } satisfies GameEvent
    expect(eventsToLogEntries([playerGain], { playerNames: { p1: 'Alice' } })).toHaveLength(1)
    expect(eventsToLogEntries([cardMove], { playerNames: { p1: 'Alice' } })).toEqual([])
  })

  it('has fixture coverage for every conditional consumer surface', () => {
    for (const [type, policy] of Object.entries(publicEventMappingPolicy) as Array<[GameEvent['type'], typeof publicEventMappingPolicy[GameEvent['type']]]>) {
      for (const surface of ['log', 'notification', 'highlight', 'resourceAnimation'] as const) {
        if (policy[surface].mode !== 'conditional') continue
        const fixtures = publicEventFixtureMatrix[type]?.[surface]
        expect(fixtures?.mapped, `${type}.${surface}.mapped`).toBeTruthy()
        expect(fixtures?.silent, `${type}.${surface}.silent`).toBeTruthy()
      }
    }
  })

  it('keeps conditional log fixtures aligned with the shared mapper', () => {
    for (const [type, surfaces] of Object.entries(publicEventFixtureMatrix) as Array<[GameEvent['type'], Partial<Record<PublicConsumerSurface, PublicConsumerFixtures>>]>) {
      const fixtures = surfaces.log
      if (!fixtures) continue
      if (fixtures.mapped) expect(eventsToLogEntries([fixtures.mapped], { playerNames: { p1: 'Alice' } }), `${type}.log.mapped`).not.toEqual([])
      if (fixtures.silent) expect(eventsToLogEntries([fixtures.silent], { playerNames: { p1: 'Alice' } }), `${type}.log.silent`).toEqual([])
    }
  })

  it('card.passed is emitted only by improvement migration branches', () => {
    const allowedFiles = [
      'shared/contract/events.ts',
      'shared/events/guards.ts',
      'shared/events/event-mapping-policy.ts',
      'shared/events/public-event-presentation.ts',
      'shared/events/log-mapper.ts',
      'shared/events/__tests__/log-mapper.test.ts',
      'shared/actions/helpers/improvement-purchase-lifecycle.ts',
      'shared/actions/helpers/__tests__/improvement-purchase-lifecycle.test.ts',
      'shared/actions/effects/internal/pass-minor-card-to-left.ts',
      'shared/cards/M/M093_FarmhandsQuarters.ts',
      'server/__tests__/M027_M093_M102_moor-cross-player-markers-session.test.ts',
      'server/__tests__/passing-mechanism-session.test.ts',
      'server/__tests__/passing-mechanism-onbuy.test.ts',
      'shared/events/__tests__/public-event-presentation.test.ts',
      'client/app/__tests__/public-event-notifications.test.ts',
      'client/app/__tests__/GameContainerApi.ws.test.ts',
    ]
    const unexpectedEmitters = findCardPassedReferences()
      .filter((line) => !allowedFiles.some((path) => line.startsWith(`${path}:`)))
    expect(unexpectedEmitters).toEqual([])
  })
})
