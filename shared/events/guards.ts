export const assertPublicGameEvent = (event: unknown): void => {
  const visibility = (event as { visibility?: unknown } | null)?.visibility
  if (visibility !== 'public') {
    throw new Error('GameEvent must be public')
  }
}

const baseEventKeys = new Set([
  'schemaVersion',
  'id',
  'seq',
  'round',
  'phase',
  'type',
  'visibility',
  'actorPlayerId',
  'targetPlayerId',
  'sourceActionId',
  'sourceCardId',
  'trigger',
])

const eventKeysByType: Record<string, readonly string[]> = {
  'resource.moved': ['resources', 'from', 'to', 'reason'],
  'resource.exchanged': ['paid', 'gained', 'paidFrom', 'paidTo', 'gainedFrom', 'gainedTo', 'exchangeSource', 'times'],
  'resource.accumulated': ['resources', 'to', 'silent'],
  'resource.paid': ['resources', 'to', 'paymentFor', 'paymentSources', 'bonusSources', 'bonusChoiceIndex', 'returnedCardId'],
  'farm.sown': ['sows', 'placementOnly'],
  'farm.cropAdded': ['crops', 'reason'],
  'farm.cropRemoved': ['crops', 'reason'],
  'farm.fieldPlowed': ['fields'],
  'farm.roomBuilt': ['rooms'],
  'farm.renovated': ['playerId', 'from', 'to', 'rooms'],
  'farm.stableBuilt': ['stables'],
  'farm.fenceBuilt': ['fences'],
  'farm.fenceConsumed': ['count', 'reason'],
  'farm.animalMoved': ['animals', 'from', 'to'],
  'farm.animalDiscarded': ['animals', 'reason'],
  'farm.animalBred': ['animals', 'source'],
  'worker.placed': ['workerId', 'spaceId', 'viaCardId'],
  'worker.returned': ['workers', 'to'],
  'worker.promoted': ['playerId', 'workerId', 'from', 'to'],
  'action.revealed': ['actionId', 'roundSlot'],
  'action.accumulated': ['spaceId', 'resources'],
  'action.exclusiveUseSet': ['actionId', 'playerId', 'sourceCardId'],
  'turn.skipped': ['playerId', 'reason'],
  'card.played': ['cardId', 'cardType'],
  'card.triggered': ['cardId', 'triggerActionId', 'optional', 'accepted', 'replacement'],
  'card.stateChanged': ['cardId', 'key', 'value', 'targetPlayerId'],
  'card.infoboxChanged': ['cardId', 'text', 'targetPlayerId'],
  'card.stackChanged': ['cardId', 'targetPlayerId', 'resources', 'delta', 'reason'],
  'card.swappedWithBoard': ['playerId', 'fromPlayerCardId', 'toPlayerCardId'],
  'card.returnedToBoard': ['playerId', 'cardId'],
  'card.destroyed': ['playerId', 'cardId', 'reason'],
  'card.passed': ['fromPlayerId', 'toPlayerId', 'cardId'],
  'futureMeeple.queued': ['playerId', 'cardId', 'entries'],
  'futureMeeple.removed': ['playerId', 'cardId', 'rounds'],
  'futureMeeple.resolved': ['playerId', 'cardId', 'round', 'resources', 'roomType'],
  'round.started': ['round'],
  'work.started': [],
  'returnHome.started': [],
  'harvest.phaseStarted': ['harvestPhase'],
}

export const assertKnownGameEventShape = (event: unknown): void => {
  if (typeof event !== 'object' || event === null) {
    throw new Error('GameEvent must be an object')
  }
  const entry = event as { type?: unknown }
  if (typeof entry.type !== 'string') {
    throw new Error('GameEvent type must be a string')
  }
  const eventKeys = eventKeysByType[entry.type]
  if (!eventKeys) {
    throw new Error(`Unknown GameEvent type: ${entry.type}`)
  }
  const allowedKeys = new Set([...baseEventKeys, ...eventKeys])
  Object.keys(event).forEach((key) => {
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown GameEvent field ${key} for ${entry.type}`)
    }
  })
}

export const assertGameEventEnvelope = (event: unknown): void => {
  if (typeof event !== 'object' || event === null) {
    throw new Error('GameEvent must be an object')
  }
  const entry = event as {
    schemaVersion?: unknown
    id?: unknown
    seq?: unknown
    round?: unknown
    phase?: unknown
    type?: unknown
  }
  if (entry.schemaVersion !== 1) {
    throw new Error('GameEvent schemaVersion must be 1')
  }
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    throw new Error('GameEvent id must be a non-empty string')
  }
  if (typeof entry.seq !== 'number' || !Number.isSafeInteger(entry.seq) || entry.seq <= 0) {
    throw new Error('GameEvent seq must be a positive safe integer')
  }
  if (typeof entry.round !== 'number' || !Number.isSafeInteger(entry.round) || entry.round <= 0) {
    throw new Error('GameEvent round must be a positive safe integer')
  }
  if (typeof entry.phase !== 'string' || entry.phase.length === 0) {
    throw new Error('GameEvent phase must be a non-empty string')
  }
  if (typeof entry.type !== 'string' || entry.type.length === 0) {
    throw new Error('GameEvent type must be a non-empty string')
  }
}

const assertJsonSafeValue = (value: unknown, path: string): void => {
  if (value === undefined) {
    throw new Error(`GameEvent must be JSON-safe at ${path}`)
  }
  if (value === null) return

  const valueType = typeof value
  if (valueType === 'string' || valueType === 'boolean') return
  if (valueType === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`GameEvent must be JSON-safe at ${path}`)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertJsonSafeValue(entry, `${path}[${index}]`))
    return
  }

  if (valueType === 'object') {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`GameEvent must be JSON-safe at ${path}`)
    }
    Object.entries(value as Record<string, unknown>).forEach(([key, entry]) => {
      assertJsonSafeValue(entry, `${path}.${key}`)
    })
    return
  }

  throw new Error(`GameEvent must be JSON-safe at ${path}`)
}

export const assertJsonSafeEvent = (event: unknown): void => {
  assertJsonSafeValue(event, '$')
}

export const assertEventSizeUnderLimit = (event: unknown, limit: number): void => {
  const serialized = JSON.stringify(event)
  const size = serialized === undefined ? 0 : serialized.length
  if (size > limit) {
    throw new Error(`GameEvent exceeds ${limit} bytes`)
  }
}
