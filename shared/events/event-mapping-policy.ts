import type { GameEvent } from '../contract/events'
import type { PrivateGameEvent } from '../contract/private-events'

export type EventConsumerMappingPolicy =
  | { mode: 'mapped' }
  | { mode: 'conditional'; condition: string; silentReason: string }
  | { mode: 'silent'; silentReason: string }

export type PublicEventMappingPolicy = {
  log: EventConsumerMappingPolicy
  notification: EventConsumerMappingPolicy
  highlight: EventConsumerMappingPolicy
  resourceAnimation: EventConsumerMappingPolicy
  replay: 'replayable' | 'metadataOnly'
  replayReason?: string
}

export type PrivateEventMappingPolicy = {
  notification: EventConsumerMappingPolicy
  publicReplay: 'excluded'
  reason: string
}

const mapped = (): EventConsumerMappingPolicy => ({ mode: 'mapped' })
const silent = (silentReason: string): EventConsumerMappingPolicy => ({ mode: 'silent', silentReason })
const conditional = (condition: string, silentReason: string): EventConsumerMappingPolicy => ({
  mode: 'conditional',
  condition,
  silentReason,
})

const silentPublicCues = (log: EventConsumerMappingPolicy): PublicEventMappingPolicy => ({
  log,
  notification: silent('consumer surface is intentionally quiet for low-noise public cues'),
  highlight: silent('event has no stable board or action-space target'),
  resourceAnimation: silent('event has no stable resource movement endpoints'),
  replay: 'replayable',
})

const boardHighlight = 'payload contains a stable board target'
const noAnimation = 'event changes board state without moving resources between supported endpoints'
const positiveResources = 'payload contains positive resources'
const metadataOnlyPublicEventTypes = new Set<GameEvent['type']>(['card.stateChanged'])

export const publicEventMappingPolicy = {
  'resource.moved': {
    log: conditional("to.kind === 'player' && positive resources", 'non-player or empty resource moves do not produce action log rows'),
    notification: silent('resource movement is too frequent for transient notifications'),
    highlight: conditional('from or to is an action-space endpoint', 'no action-space endpoint to highlight'),
    resourceAnimation: conditional('from and to are supported animation endpoints', 'one or both endpoints cannot be rendered as resource animation endpoints'),
    replay: 'replayable',
  },
  'resource.exchanged': {
    log: mapped(),
    notification: mapped(),
    highlight: conditional('any paid or gained endpoint is an action-space endpoint', 'no action-space endpoint to highlight'),
    resourceAnimation: conditional('paid or gained side has both endpoints supported', 'exchange endpoints cannot be rendered as resource animation endpoints'),
    replay: 'replayable',
  },
  'resource.accumulated': {
    log: conditional(positiveResources, 'empty accumulation does not produce an action log row'),
    notification: conditional('silent !== true && positive resources', 'silent or empty accumulation does not notify'),
    highlight: conditional("positive resources && to.kind === 'actionSpace'", 'non-action-space or empty accumulation has no stable action highlight'),
    resourceAnimation: conditional("positive resources && to.kind === 'actionSpace'", 'non-action-space or empty accumulation has no stable animation endpoint'),
    replay: 'replayable',
  },
  'resource.paid': {
    log: mapped(),
    notification: conditional(positiveResources, 'empty payment events are bonus/card-return metadata and do not notify'),
    highlight: conditional('source action, action-space target, or action-space payment source exists', 'payment has no action-space endpoint to highlight'),
    resourceAnimation: conditional('actor fallback or paymentSources endpoint is supported', 'payment source or destination cannot be rendered as resource animation endpoints'),
    replay: 'replayable',
  },
  'farm.sown': {
    log: mapped(),
    notification: silent('farm sowing is represented by board highlight and log'),
    highlight: conditional(boardHighlight, 'sow locations do not include farm field targets'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.cropAdded': {
    log: mapped(),
    notification: silent('crop changes are represented by board highlight and log'),
    highlight: conditional('crop payload contains farm tile locations', 'crop payload has no farm tile target'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.cropRemoved': {
    log: mapped(),
    notification: silent('crop changes are represented by board highlight and log'),
    highlight: conditional('crop payload contains farm tile locations', 'crop payload has no farm tile target'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.fieldPlowed': {
    log: mapped(),
    notification: silent('field plowing is represented by board highlight and log'),
    highlight: conditional(boardHighlight, 'field payload is empty'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.roomBuilt': {
    log: mapped(),
    notification: silent('room building is represented by board highlight and log'),
    highlight: conditional(boardHighlight, 'room payload is empty'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.renovated': {
    log: mapped(),
    notification: silent('renovation is represented by board highlight and log'),
    highlight: conditional(boardHighlight, 'renovation rooms payload is empty'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.stableBuilt': {
    log: mapped(),
    notification: silent('stable building is represented by board highlight and log'),
    highlight: conditional(boardHighlight, 'stable payload is empty'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.fenceBuilt': {
    log: conditional('fence or palisade count is positive', 'fence payload contains no fence or palisade entries'),
    notification: mapped(),
    highlight: conditional('newFenceEdges plus actor or target player exists', 'fence edge owner cannot be determined'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.fenceConsumed': {
    log: mapped(),
    notification: silent('fence consumption is represented by log only'),
    highlight: silent('event has no concrete fence edge payload'),
    resourceAnimation: silent(noAnimation),
    replay: 'replayable',
  },
  'farm.animalMoved': {
    log: mapped(),
    notification: silent('animal movement is represented by log only'),
    highlight: silent('event has no concrete farm tile payload'),
    resourceAnimation: silent('animal movement is not a resource animation between supported endpoints'),
    replay: 'replayable',
  },
  'farm.animalDiscarded': silentPublicCues(mapped()),
  'farm.animalBred': silentPublicCues(conditional("source === 'harvest'", 'non-harvest breeding is card-effect metadata and stays out of the action log')),
  'worker.placed': {
    log: mapped(),
    notification: silent('worker placement is frequent and already visible on board'),
    highlight: mapped(),
    resourceAnimation: silent('worker placement does not move resources'),
    replay: 'replayable',
  },
  'worker.returned': silentPublicCues(mapped()),
  'worker.promoted': {
    log: mapped(),
    notification: mapped(),
    highlight: silent('worker promotion has no stable board target'),
    resourceAnimation: silent('worker promotion does not move resources'),
    replay: 'replayable',
  },
  'action.revealed': {
    log: mapped(),
    notification: mapped(),
    highlight: mapped(),
    resourceAnimation: silent('action reveal does not move resources'),
    replay: 'replayable',
  },
  'action.accumulated': {
    log: conditional(positiveResources, 'empty accumulation does not produce an action log row'),
    notification: conditional(positiveResources, 'empty accumulation does not notify'),
    highlight: conditional(positiveResources, 'empty accumulation has no visible action-space change'),
    resourceAnimation: conditional(positiveResources, 'empty accumulation does not animate'),
    replay: 'replayable',
  },
  'action.exclusiveUseSet': {
    log: mapped(),
    notification: mapped(),
    highlight: mapped(),
    resourceAnimation: silent('exclusive-use metadata does not move resources'),
    replay: 'replayable',
  },
  'action.exclusiveUseCleared': {
    log: mapped(),
    notification: mapped(),
    highlight: mapped(),
    resourceAnimation: silent('exclusive-use metadata does not move resources'),
    replay: 'replayable',
  },
  'action.detailLogged': silentPublicCues(mapped()),
  'action.granted': silentPublicCues(mapped()),
  'turn.skipped': silentPublicCues(mapped()),
  'startPlayer.changed': silentPublicCues(mapped()),
  'card.played': silentPublicCues(mapped()),
  'card.triggered': silentPublicCues(mapped()),
  'card.stateChanged': {
    log: silent('low-level state audit; visible card changes use more specific card events'),
    notification: silent('low-level state audit; visible card changes use more specific card events'),
    highlight: silent('low-level state audit has no stable board target'),
    resourceAnimation: silent('low-level state audit does not move resources'),
    replay: 'metadataOnly',
    replayReason: 'low-level state audit, use more specific card events for visible UI',
  },
  'card.infoboxChanged': {
    log: mapped(),
    notification: mapped(),
    highlight: silent('infobox changes have no stable board target'),
    resourceAnimation: silent('infobox changes do not move resources'),
    replay: 'replayable',
  },
  'card.stackChanged': {
    log: mapped(),
    notification: conditional(positiveResources, 'empty stack changes do not notify'),
    highlight: silent('card stack changes have no stable board target'),
    resourceAnimation: silent('card stack endpoints are not stable public animation anchors'),
    replay: 'replayable',
  },
  'card.resourcePairsStored': {
    log: mapped(),
    notification: silent('resource-pair storage is represented by action log only'),
    highlight: silent('resource-pair storage has no stable board target'),
    resourceAnimation: silent('resource-pair storage does not move resources between supported endpoints'),
    replay: 'replayable',
  },
  'card.swappedWithBoard': {
    log: mapped(),
    notification: mapped(),
    highlight: silent('card swap has no stable board target'),
    resourceAnimation: silent('card swap does not move resources'),
    replay: 'replayable',
  },
  'card.returnedToBoard': {
    log: mapped(),
    notification: mapped(),
    highlight: silent('card return has no stable board target'),
    resourceAnimation: silent('card return does not move resources'),
    replay: 'replayable',
  },
  'card.destroyed': silentPublicCues(mapped()),
  'card.passed': silentPublicCues(mapped()),
  'futureMeeple.queued': {
    log: conditional('sourceSummary present', 'queue events without sourceSummary are replay/notification metadata only'),
    notification: mapped(),
    highlight: silent('future meeple queue has no current board target'),
    resourceAnimation: silent('future meeple queue does not move resources now'),
    replay: 'replayable',
  },
  'futureMeeple.removed': {
    log: mapped(),
    notification: mapped(),
    highlight: silent('future meeple removal has no current board target'),
    resourceAnimation: silent('future meeple removal does not move resources now'),
    replay: 'replayable',
  },
  'futureMeeple.resolved': {
    log: conditional(
      'no positive resources, roomType present, or resources contain field/stable/forest/moor',
      'pure resource resolution is represented by the receive resource movement',
    ),
    notification: mapped(),
    highlight: silent('future meeple resolution has no current board target'),
    resourceAnimation: silent('future meeple resolution does not move resources now'),
    replay: 'replayable',
  },
  'parent.motherScheduled': silentPublicCues(mapped()),
  'round.started': silentPublicCues(mapped()),
  'work.started': silentPublicCues(mapped()),
  'returnHome.started': silentPublicCues(mapped()),
  'harvest.started': silentPublicCues(mapped()),
  'harvest.phaseStarted': silentPublicCues(mapped()),
  'harvest.reapSkipped': silentPublicCues(mapped()),
  'harvest.reapNothing': silentPublicCues(mapped()),
  'harvest.feedConverted': silentPublicCues(mapped()),
  'harvest.heated': silentPublicCues(mapped()),
  'game.started': silentPublicCues(mapped()),
  'game.ended': silentPublicCues(mapped()),
} satisfies Record<GameEvent['type'], PublicEventMappingPolicy>

export const privateEventMappingPolicy = {
  'private.promptShown': {
    notification: mapped(),
    publicReplay: 'excluded',
    reason: 'private prompt is per-viewer runtime state',
  },
  'private.handChanged': {
    notification: mapped(),
    publicReplay: 'excluded',
    reason: 'hand contents are private and only count/source are surfaced',
  },
  'private.draftUpdated': {
    notification: mapped(),
    publicReplay: 'excluded',
    reason: 'draft state is per-viewer private state',
  },
} satisfies Record<PrivateGameEvent['type'], PrivateEventMappingPolicy>

export const isPublicEventReplayable = (event: GameEvent): boolean =>
  !metadataOnlyPublicEventTypes.has(event.type)
