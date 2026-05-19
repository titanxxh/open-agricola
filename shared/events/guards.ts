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
  'action.granted': ['playerId', 'actionId', 'cardId'],
  'turn.skipped': ['playerId', 'reason'],
  'startPlayer.changed': ['playerId'],
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
  'harvest.started': [],
  'harvest.phaseStarted': ['harvestPhase'],
  'harvest.reapSkipped': ['playerId'],
  'harvest.reapNothing': ['playerId'],
  'harvest.feedConverted': ['playerId', 'source', 'cost', 'food'],
  'game.started': [],
  'game.ended': [],
}

const resourceKeys = new Set([
  'wood',
  'clay',
  'reed',
  'stone',
  'food',
  'grain',
  'vegetable',
  'sheep',
  'boar',
  'cattle',
  'begging',
  'occupation',
  'field',
  'roomWood',
  'roomClay',
  'roomStone',
  'stable',
])

const privatePayloadKeys = new Set([
  'hand',
  'minorHand',
  'occupationHand',
  'privateHand',
  'draft',
  'prompt',
  'promptKey',
  'pending',
  'interaction',
  'choice',
  'choices',
  'options',
])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const assertRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!isRecord(value)) {
    throw new Error(`GameEvent ${path} must be an object`)
  }
  return value
}

const assertOnlyKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
  path: string,
): void => {
  const allowed = new Set(keys)
  Object.keys(value).forEach((key) => {
    if (!allowed.has(key)) {
      throw new Error(`GameEvent ${path} has unknown field ${key}`)
    }
  })
}

const assertStringField = (value: unknown, path: string): void => {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`GameEvent ${path} must be a non-empty string`)
  }
}

const assertFiniteNumberField = (value: unknown, path: string): void => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`GameEvent ${path} must be a finite number`)
  }
}

const assertNoPrivatePayload = (value: unknown, path: string): void => {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoPrivatePayload(entry, `${path}[${index}]`))
    return
  }
  if (!isRecord(value)) return
  Object.entries(value).forEach(([key, entry]) => {
    if (privatePayloadKeys.has(key)) {
      throw new Error(`GameEvent public schema rejects private payload at ${path}.${key}`)
    }
    assertNoPrivatePayload(entry, `${path}.${key}`)
  })
}

const assertResourceMap = (value: unknown, path: string): void => {
  const record = assertRecord(value, path)
  Object.entries(record).forEach(([key, entry]) => {
    if (!resourceKeys.has(key)) {
      throw new Error(`GameEvent ${path} has unknown resource ${key}`)
    }
    assertFiniteNumberField(entry, `${path}.${key}`)
  })
}

const assertResourceLocation = (value: unknown, path: string): void => {
  const record = assertRecord(value, path)
  const kind = record.kind
  if (kind === 'supply') {
    assertOnlyKeys(record, ['kind'], path)
    return
  }
  if (kind === 'player') {
    assertOnlyKeys(record, ['kind', 'playerId'], path)
    assertStringField(record.playerId, `${path}.playerId`)
    return
  }
  if (kind === 'actionSpace') {
    assertOnlyKeys(record, ['kind', 'spaceId'], path)
    assertStringField(record.spaceId, `${path}.spaceId`)
    return
  }
  if (kind === 'field') {
    assertOnlyKeys(record, ['kind', 'playerId', 'row', 'col'], path)
    assertStringField(record.playerId, `${path}.playerId`)
    assertFiniteNumberField(record.row, `${path}.row`)
    assertFiniteNumberField(record.col, `${path}.col`)
    return
  }
  if (kind === 'card') {
    assertOnlyKeys(record, ['kind', 'playerId', 'cardId'], path)
    if (record.playerId !== undefined) assertStringField(record.playerId, `${path}.playerId`)
    assertStringField(record.cardId, `${path}.cardId`)
    return
  }
  if (kind === 'roundCard') {
    assertOnlyKeys(record, ['kind', 'round'], path)
    assertFiniteNumberField(record.round, `${path}.round`)
    return
  }
  throw new Error(`GameEvent ${path} has unknown ResourceLocation kind`)
}

const assertPaymentSources = (value: unknown): void => {
  if (value === undefined) return
  if (!Array.isArray(value)) {
    throw new Error('GameEvent paymentSources must be an array')
  }
  value.forEach((entry, index) => {
    const record = assertRecord(entry, `paymentSources[${index}]`)
    assertOnlyKeys(record, ['from', 'resources'], `paymentSources[${index}]`)
    assertResourceLocation(record.from, `paymentSources[${index}].from`)
    assertResourceMap(record.resources, `paymentSources[${index}].resources`)
  })
}

const assertPublicCardStateValue = (value: unknown, path: string): void => {
  if (value === null) return
  if (typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`GameEvent ${path} must be a public scalar or array`)
    }
    return
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicCardStateValue(entry, `${path}[${index}]`))
    return
  }
  throw new Error(`GameEvent ${path} must be a public scalar or array`)
}

const assertKnownEventDetails = (type: string, event: Record<string, unknown>): void => {
  switch (type) {
    case 'resource.moved':
      assertResourceMap(event.resources, 'resources')
      assertResourceLocation(event.from, 'from')
      assertResourceLocation(event.to, 'to')
      return
    case 'resource.exchanged':
      assertResourceMap(event.paid, 'paid')
      assertResourceMap(event.gained, 'gained')
      assertResourceLocation(event.paidFrom, 'paidFrom')
      assertResourceLocation(event.paidTo, 'paidTo')
      assertResourceLocation(event.gainedFrom, 'gainedFrom')
      assertResourceLocation(event.gainedTo, 'gainedTo')
      return
    case 'resource.accumulated':
      assertResourceMap(event.resources, 'resources')
      assertResourceLocation(event.to, 'to')
      return
    case 'resource.paid':
      assertResourceMap(event.resources, 'resources')
      if (event.to !== undefined) assertResourceLocation(event.to, 'to')
      assertPaymentSources(event.paymentSources)
      return
    case 'farm.sown':
      if (!Array.isArray(event.sows)) throw new Error('GameEvent sows must be an array')
      event.sows.forEach((entry, index) => {
        const record = assertRecord(entry, `sows[${index}]`)
        assertOnlyKeys(record, ['location', 'crop', 'added'], `sows[${index}]`)
        assertResourceLocation(record.location, `sows[${index}].location`)
        assertFiniteNumberField(record.added, `sows[${index}].added`)
      })
      return
    case 'farm.cropAdded':
    case 'farm.cropRemoved':
      if (!Array.isArray(event.crops)) throw new Error('GameEvent crops must be an array')
      event.crops.forEach((entry, index) => {
        const record = assertRecord(entry, `crops[${index}]`)
        assertOnlyKeys(record, ['location', 'crop', 'amount'], `crops[${index}]`)
        assertResourceLocation(record.location, `crops[${index}].location`)
        assertFiniteNumberField(record.amount, `crops[${index}].amount`)
      })
      return
    case 'farm.animalMoved':
      assertResourceMap(event.animals, 'animals')
      if (event.from !== undefined) assertResourceLocation(event.from, 'from')
      if (event.to !== undefined) assertResourceLocation(event.to, 'to')
      return
    case 'farm.animalDiscarded':
    case 'farm.animalBred':
      assertResourceMap(event.animals, 'animals')
      return
    case 'worker.returned':
      if (!Array.isArray(event.workers)) throw new Error('GameEvent workers must be an array')
      event.workers.forEach((entry, index) => {
        const record = assertRecord(entry, `workers[${index}]`)
        assertOnlyKeys(record, ['playerId', 'workerId'], `workers[${index}]`)
        assertStringField(record.playerId, `workers[${index}].playerId`)
        assertStringField(record.workerId, `workers[${index}].workerId`)
      })
      return
    case 'action.accumulated':
      assertResourceMap(event.resources, 'resources')
      return
    case 'card.stateChanged':
      assertPublicCardStateValue(event.value, 'card.stateChanged.value')
      return
    case 'card.stackChanged':
      if (event.resources !== undefined) assertResourceMap(event.resources, 'resources')
      return
    case 'futureMeeple.queued':
      if (!Array.isArray(event.entries)) throw new Error('GameEvent entries must be an array')
      event.entries.forEach((entry, index) => {
        const record = assertRecord(entry, `entries[${index}]`)
        if (record.resources !== undefined) assertResourceMap(record.resources, `entries[${index}].resources`)
      })
      return
    case 'futureMeeple.resolved':
      if (event.resources !== undefined) assertResourceMap(event.resources, 'resources')
      return
    case 'harvest.feedConverted':
      assertResourceMap(event.cost, 'cost')
      assertResourceMap(event.food, 'food')
      return
    default:
      assertNoPrivatePayload(event, '$')
  }
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
  assertNoPrivatePayload(event, '$')
  assertKnownEventDetails(entry.type, event as Record<string, unknown>)
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
