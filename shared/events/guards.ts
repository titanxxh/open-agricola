import { PAYMENT_RESOURCE_KEYS, REAL_RESOURCE_KEYS, isPaymentResourceKey } from '../contract/resource-keys'

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
  'farm.fenceBuilt': ['fences', 'newFenceEdges', 'newPastures'],
  'farm.fenceConsumed': ['count', 'reason'],
  'farm.animalMoved': ['animals', 'from', 'to', 'newlyPlacedOnFarmyard'],
  'farm.animalDiscarded': ['animals', 'reason'],
  'farm.animalBred': ['animals', 'source'],
  'worker.placed': ['workerId', 'spaceId', 'viaCardId'],
  'worker.returned': ['workers', 'to'],
  'worker.promoted': ['playerId', 'workerId', 'from', 'to'],
  'action.revealed': ['actionId', 'roundSlot'],
  'action.accumulated': ['spaceId', 'resources'],
  'action.exclusiveUseSet': ['actionId', 'playerId', 'sourceCardId', 'untilRound'],
  'action.exclusiveUseCleared': ['actionId', 'playerId', 'sourceCardId'],
  'action.detailLogged': ['playerId', 'actionId', 'detailParts'],
  'action.granted': ['playerId', 'actionId', 'cardId'],
  'turn.skipped': ['playerId', 'reason'],
  'startPlayer.changed': ['playerId'],
  'card.played': ['cardId', 'cardType'],
  'card.triggered': ['cardId', 'triggerActionId', 'optional', 'accepted', 'replacement'],
  'card.stateChanged': ['cardId', 'key', 'value', 'targetPlayerId'],
  'card.infoboxChanged': ['cardId', 'text', 'targetPlayerId'],
  'card.stackChanged': ['cardId', 'targetPlayerId', 'resources', 'delta', 'reason'],
  'card.resourcePairsStored': ['cardId', 'targetPlayerId', 'pairs'],
  'card.swappedWithBoard': ['playerId', 'fromPlayerCardId', 'toPlayerCardId'],
  'card.returnedToBoard': ['playerId', 'cardId'],
  'card.destroyed': ['playerId', 'cardId', 'reason'],
  'card.passed': ['fromPlayerId', 'toPlayerId', 'cardId'],
  'futureMeeple.queued': ['playerId', 'cardId', 'entries', 'sourceSummary'],
  'futureMeeple.removed': ['playerId', 'cardId', 'rounds'],
  'futureMeeple.resolved': ['playerId', 'cardId', 'round', 'resources', 'roomType'],
  'parent.motherScheduled': ['playerId', 'cardId', 'targetRound', 'reward'],
  'round.started': ['round'],
  'work.started': [],
  'snakeOpening.reversed': [],
  'returnHome.started': [],
  'harvest.started': [],
  'harvest.phaseStarted': ['harvestPhase'],
  'harvest.reapSkipped': ['playerId'],
  'harvest.reapNothing': ['playerId'],
  'harvest.feedConverted': ['playerId', 'source', 'cost', 'food'],
  'harvest.heated': ['playerId', 'required', 'fuelUsed', 'woodToFuel', 'sickWorkerIds'],
  'game.started': [],
  'game.ended': [],
  'continuation.restored': ['reason'],
}

const resourceKeys = new Set<string>(REAL_RESOURCE_KEYS)

const paymentResourceKeys = new Set<string>(PAYMENT_RESOURCE_KEYS)

const futureMeepleResourceKeys = new Set([
  ...REAL_RESOURCE_KEYS,
  'field',
  'stable',
  'forest',
  'moor',
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

const assertStringValue = (value: unknown, path: string): void => {
  if (typeof value !== 'string') {
    throw new Error(`GameEvent ${path} must be a string`)
  }
}

const assertFiniteNumberField = (value: unknown, path: string): void => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`GameEvent ${path} must be a finite number`)
  }
}

const assertOptionalStringField = (value: unknown, path: string): void => {
  if (value !== undefined) assertStringField(value, path)
}

const assertOptionalFiniteNumberField = (value: unknown, path: string): void => {
  if (value !== undefined) assertFiniteNumberField(value, path)
}

const assertNumberArray = (value: unknown, path: string): void => {
  if (!Array.isArray(value)) {
    throw new Error(`GameEvent ${path} must be an array`)
  }
  value.forEach((entry, index) => assertFiniteNumberField(entry, `${path}[${index}]`))
}

const assertStringArray = (value: unknown, path: string): void => {
  if (!Array.isArray(value)) {
    throw new Error(`GameEvent ${path} must be an array`)
  }
  value.forEach((entry, index) => assertStringField(entry, `${path}[${index}]`))
}

const assertFencePastures = (value: unknown, path: string): void => {
  if (!Array.isArray(value)) {
    throw new Error(`GameEvent ${path} must be an array`)
  }
  value.forEach((entry, index) => {
    const record = assertRecord(entry, `${path}[${index}]`)
    if (record.tiles !== undefined && !Array.isArray(record.tiles)) {
      throw new Error(`GameEvent ${path}[${index}].tiles must be an array`)
    }
  })
}

const assertBoardPositions = (
  value: unknown,
  path: string,
  keys: readonly string[],
): void => {
  if (!Array.isArray(value)) throw new Error(`GameEvent ${path} must be an array`)
  value.forEach((entry, index) => {
    const record = assertRecord(entry, `${path}[${index}]`)
    assertOnlyKeys(record, keys, `${path}[${index}]`)
    if (keys.includes('playerId')) assertStringField(record.playerId, `${path}[${index}].playerId`)
    assertFiniteNumberField(record.row, `${path}[${index}].row`)
    assertFiniteNumberField(record.col, `${path}[${index}].col`)
    if (keys.includes('type')) assertStringField(record.type, `${path}[${index}].type`)
  })
}

const assertStableBuiltPositions = (value: unknown, path: string): void => {
  if (!Array.isArray(value)) throw new Error(`GameEvent ${path} must be an array`)
  value.forEach((entry, index) => {
    const record = assertRecord(entry, `${path}[${index}]`)
    assertOnlyKeys(record, ['playerId', 'row', 'col', 'kind', 'sourceCardId'], `${path}[${index}]`)
    assertStringField(record.playerId, `${path}[${index}].playerId`)
    assertFiniteNumberField(record.row, `${path}[${index}].row`)
    assertFiniteNumberField(record.col, `${path}[${index}].col`)
    if (record.kind !== undefined && record.kind !== 'normal' && record.kind !== 'special') {
      throw new Error(`GameEvent ${path}[${index}].kind must be 'normal' or 'special'`)
    }
    assertOptionalStringField(record.sourceCardId, `${path}[${index}].sourceCardId`)
  })
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

const assertResourceMapForKeys = (
  value: unknown,
  path: string,
  allowedKeys: ReadonlySet<string>,
  extraAllowed?: (key: string) => boolean,
): void => {
  const record = assertRecord(value, path)
  Object.entries(record).forEach(([key, entry]) => {
    if (!allowedKeys.has(key) && !extraAllowed?.(key)) {
      throw new Error(`GameEvent ${path} has unknown resource ${key}`)
    }
    assertFiniteNumberField(entry, `${path}.${key}`)
  })
}

const assertResourceMap = (value: unknown, path: string): void =>
  assertResourceMapForKeys(value, path, resourceKeys)

const assertResourceMapArray = (value: unknown, path: string): void => {
  if (!Array.isArray(value)) {
    throw new Error(`GameEvent ${path} must be an array`)
  }
  value.forEach((entry, index) => assertResourceMap(entry, `${path}[${index}]`))
}

const assertPaymentResourceMap = (value: unknown, path: string): void => {
  assertResourceMapForKeys(value, path, paymentResourceKeys, isPaymentResourceKey)
}

const assertFutureMeepleResourceMap = (value: unknown, path: string): void =>
  assertResourceMapForKeys(value, path, futureMeepleResourceKeys)

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
    assertPaymentResourceMap(record.resources, `paymentSources[${index}].resources`)
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

const assertFutureMeepleSourceSummary = (value: unknown): void => {
  if (value === undefined) return
  const summary = assertRecord(value, 'sourceSummary')
  assertOnlyKeys(summary, ['key', 'params'], 'sourceSummary')
  if (summary.key !== 'log.salterFutureFood') {
    throw new Error('GameEvent sourceSummary.key must be log.salterFutureFood')
  }
  const params = assertRecord(summary.params, 'sourceSummary.params')
  assertOnlyKeys(params, ['cardId', 'animals', 'sheep', 'boar', 'cattle', 'futureFood', 'schedule'], 'sourceSummary.params')
  assertStringField(params.cardId, 'sourceSummary.params.cardId')
  assertStringField(params.animals, 'sourceSummary.params.animals')
  assertFiniteNumberField(params.sheep, 'sourceSummary.params.sheep')
  assertFiniteNumberField(params.boar, 'sourceSummary.params.boar')
  assertFiniteNumberField(params.cattle, 'sourceSummary.params.cattle')
  assertFiniteNumberField(params.futureFood, 'sourceSummary.params.futureFood')
  assertStringField(params.schedule, 'sourceSummary.params.schedule')
}

const assertActionDetailEffects = (value: unknown): void => {
  if (value === undefined) return
  const effects = assertRecord(value, 'detailParts.effects')
  assertOnlyKeys(effects, [
    'buildRoom',
    'buildStables',
    'growFamily',
    'plow',
    'sowGrain',
    'sowVegetable',
    'renovate',
    'fencing',
    'palisading',
    'improvements',
    'minorImprovements',
    'startPlayer',
    'bakeBread',
  ], 'detailParts.effects')
  for (const key of ['buildRoom', 'buildStables', 'growFamily', 'plow', 'sowGrain', 'sowVegetable', 'fencing', 'palisading']) {
    if (effects[key] !== undefined) assertFiniteNumberField(effects[key], `detailParts.effects.${key}`)
  }
  if (effects.startPlayer !== undefined && typeof effects.startPlayer !== 'boolean') {
    throw new Error('GameEvent detailParts.effects.startPlayer must be a boolean')
  }
  if (effects.improvements !== undefined) assertStringArray(effects.improvements, 'detailParts.effects.improvements')
  if (effects.minorImprovements !== undefined) assertStringArray(effects.minorImprovements, 'detailParts.effects.minorImprovements')
  if (effects.renovate !== undefined) {
    const renovate = assertRecord(effects.renovate, 'detailParts.effects.renovate')
    assertOnlyKeys(renovate, ['from', 'to'], 'detailParts.effects.renovate')
    assertStringField(renovate.from, 'detailParts.effects.renovate.from')
    assertStringField(renovate.to, 'detailParts.effects.renovate.to')
  }
  if (effects.bakeBread !== undefined) {
    const bakeBread = assertRecord(effects.bakeBread, 'detailParts.effects.bakeBread')
    assertOnlyKeys(bakeBread, ['count', 'food'], 'detailParts.effects.bakeBread')
    assertFiniteNumberField(bakeBread.count, 'detailParts.effects.bakeBread.count')
    assertFiniteNumberField(bakeBread.food, 'detailParts.effects.bakeBread.food')
  }
}

const assertActionDetailParts = (value: unknown): void => {
  const detailParts = assertRecord(value, 'detailParts')
  assertOnlyKeys(detailParts, ['gains', 'costs', 'effects', 'bonusSources'], 'detailParts')
  if (detailParts.gains !== undefined) assertResourceMap(detailParts.gains, 'detailParts.gains')
  if (detailParts.costs !== undefined) assertResourceMap(detailParts.costs, 'detailParts.costs')
  assertActionDetailEffects(detailParts.effects)
  if (detailParts.bonusSources !== undefined) assertStringArray(detailParts.bonusSources, 'detailParts.bonusSources')
}

const assertKnownEventDetails = (type: string, event: Record<string, unknown>): void => {
  switch (type) {
    case 'resource.moved':
      assertResourceMap(event.resources, 'resources')
      assertResourceLocation(event.from, 'from')
      assertResourceLocation(event.to, 'to')
      assertStringField(event.reason, 'reason')
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
      assertPaymentResourceMap(event.resources, 'resources')
      assertStringField(event.paymentFor, 'paymentFor')
      if (event.to !== undefined) assertResourceLocation(event.to, 'to')
      assertPaymentSources(event.paymentSources)
      return
    case 'farm.sown':
      if (!Array.isArray(event.sows)) throw new Error('GameEvent sows must be an array')
      event.sows.forEach((entry, index) => {
        const record = assertRecord(entry, `sows[${index}]`)
        assertOnlyKeys(record, ['location', 'crop', 'added'], `sows[${index}]`)
        assertResourceLocation(record.location, `sows[${index}].location`)
        assertStringField(record.crop, `sows[${index}].crop`)
        assertFiniteNumberField(record.added, `sows[${index}].added`)
      })
      return
    case 'farm.cropAdded':
    case 'farm.cropRemoved':
      assertStringField(event.reason, 'reason')
      if (!Array.isArray(event.crops)) throw new Error('GameEvent crops must be an array')
      event.crops.forEach((entry, index) => {
        const record = assertRecord(entry, `crops[${index}]`)
        assertOnlyKeys(record, ['location', 'crop', 'amount'], `crops[${index}]`)
        assertResourceLocation(record.location, `crops[${index}].location`)
        assertStringField(record.crop, `crops[${index}].crop`)
        assertFiniteNumberField(record.amount, `crops[${index}].amount`)
      })
      return
    case 'farm.fieldPlowed':
      assertBoardPositions(event.fields, 'fields', ['playerId', 'row', 'col'])
      return
    case 'farm.roomBuilt':
      assertBoardPositions(event.rooms, 'rooms', ['playerId', 'row', 'col', 'type'])
      return
    case 'farm.renovated':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.from, 'from')
      assertStringField(event.to, 'to')
      assertBoardPositions(event.rooms, 'rooms', ['row', 'col'])
      return
    case 'farm.stableBuilt':
      assertStableBuiltPositions(event.stables, 'stables')
      return
    case 'farm.fenceBuilt':
      if (!Array.isArray(event.fences)) throw new Error('GameEvent fences must be an array')
      if (event.newFenceEdges !== undefined) assertStringArray(event.newFenceEdges, 'newFenceEdges')
      if (event.newPastures !== undefined) assertFencePastures(event.newPastures, 'newPastures')
      return
    case 'farm.fenceConsumed':
      assertFiniteNumberField(event.count, 'count')
      assertStringField(event.reason, 'reason')
      return
    case 'farm.animalMoved':
      assertResourceMap(event.animals, 'animals')
      if (event.newlyPlacedOnFarmyard !== undefined) assertResourceMap(event.newlyPlacedOnFarmyard, 'newlyPlacedOnFarmyard')
      if (event.from !== undefined) assertResourceLocation(event.from, 'from')
      if (event.to !== undefined) assertResourceLocation(event.to, 'to')
      return
    case 'farm.animalDiscarded':
      assertStringField(event.reason, 'reason')
      assertResourceMap(event.animals, 'animals')
      return
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
      assertStringField(event.to, 'to')
      return
    case 'worker.placed':
      assertStringField(event.workerId, 'workerId')
      assertStringField(event.spaceId, 'spaceId')
      assertOptionalStringField(event.viaCardId, 'viaCardId')
      return
    case 'worker.promoted':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.workerId, 'workerId')
      assertStringField(event.from, 'from')
      assertStringField(event.to, 'to')
      return
    case 'action.revealed':
      assertStringField(event.actionId, 'actionId')
      assertFiniteNumberField(event.roundSlot, 'roundSlot')
      return
    case 'action.accumulated':
      assertStringField(event.spaceId, 'spaceId')
      assertResourceMap(event.resources, 'resources')
      return
    case 'action.exclusiveUseSet':
      assertStringField(event.actionId, 'actionId')
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.sourceCardId, 'sourceCardId')
      assertFiniteNumberField(event.untilRound, 'untilRound')
      return
    case 'action.exclusiveUseCleared':
      assertStringField(event.actionId, 'actionId')
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.sourceCardId, 'sourceCardId')
      return
    case 'action.detailLogged':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.actionId, 'actionId')
      assertActionDetailParts(event.detailParts)
      return
    case 'action.granted':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.actionId, 'actionId')
      assertStringField(event.cardId, 'cardId')
      return
    case 'turn.skipped':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.reason, 'reason')
      return
    case 'startPlayer.changed':
      assertStringField(event.playerId, 'playerId')
      return
    case 'card.played':
      assertStringField(event.cardId, 'cardId')
      assertStringField(event.cardType, 'cardType')
      return
    case 'card.triggered':
      assertStringField(event.cardId, 'cardId')
      assertOptionalStringField(event.triggerActionId, 'triggerActionId')
      return
    case 'card.stateChanged':
      assertStringField(event.cardId, 'cardId')
      assertStringField(event.key, 'key')
      assertStringField(event.targetPlayerId, 'targetPlayerId')
      if (event.value !== undefined) assertPublicCardStateValue(event.value, 'card.stateChanged.value')
      return
    case 'card.infoboxChanged':
      assertStringField(event.cardId, 'cardId')
      assertStringValue(event.text, 'text')
      assertStringField(event.targetPlayerId, 'targetPlayerId')
      return
    case 'card.stackChanged':
      assertStringField(event.cardId, 'cardId')
      assertStringField(event.reason, 'reason')
      assertOptionalStringField(event.targetPlayerId, 'targetPlayerId')
      if (event.resources !== undefined) assertResourceMap(event.resources, 'resources')
      assertOptionalFiniteNumberField(event.delta, 'delta')
      return
    case 'card.resourcePairsStored':
      assertStringField(event.cardId, 'cardId')
      assertStringField(event.targetPlayerId, 'targetPlayerId')
      assertResourceMapArray(event.pairs, 'pairs')
      return
    case 'card.swappedWithBoard':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.fromPlayerCardId, 'fromPlayerCardId')
      assertStringField(event.toPlayerCardId, 'toPlayerCardId')
      return
    case 'card.returnedToBoard':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.cardId, 'cardId')
      return
    case 'card.destroyed':
      assertOptionalStringField(event.playerId, 'playerId')
      assertStringField(event.cardId, 'cardId')
      assertStringField(event.reason, 'reason')
      return
    case 'card.passed':
      assertStringField(event.fromPlayerId, 'fromPlayerId')
      assertStringField(event.toPlayerId, 'toPlayerId')
      assertStringField(event.cardId, 'cardId')
      return
    case 'futureMeeple.queued':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.cardId, 'cardId')
      if (!Array.isArray(event.entries)) throw new Error('GameEvent entries must be an array')
      event.entries.forEach((entry, index) => {
        const record = assertRecord(entry, `entries[${index}]`)
        assertFiniteNumberField(record.round, `entries[${index}].round`)
        if (record.resources !== undefined) assertFutureMeepleResourceMap(record.resources, `entries[${index}].resources`)
        assertOptionalStringField(record.roomType, `entries[${index}].roomType`)
      })
      assertFutureMeepleSourceSummary(event.sourceSummary)
      return
    case 'futureMeeple.removed':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.cardId, 'cardId')
      if (event.rounds !== undefined) assertNumberArray(event.rounds, 'rounds')
      return
    case 'futureMeeple.resolved':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.cardId, 'cardId')
      assertFiniteNumberField(event.round, 'round')
      if (event.resources !== undefined) assertFutureMeepleResourceMap(event.resources, 'resources')
      assertOptionalStringField(event.roomType, 'roomType')
      return
    case 'parent.motherScheduled':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.cardId, 'cardId')
      assertFiniteNumberField(event.targetRound, 'targetRound')
      assertStringField(event.reward, 'reward')
      return
    case 'round.started':
      assertFiniteNumberField(event.round, 'round')
      return
    case 'harvest.phaseStarted':
      assertStringField(event.harvestPhase, 'harvestPhase')
      return
    case 'harvest.reapSkipped':
    case 'harvest.reapNothing':
      assertStringField(event.playerId, 'playerId')
      return
    case 'harvest.feedConverted':
      assertStringField(event.playerId, 'playerId')
      assertStringField(event.source, 'source')
      assertResourceMap(event.cost, 'cost')
      assertResourceMap(event.food, 'food')
      return
    case 'harvest.heated':
      assertStringField(event.playerId, 'playerId')
      assertFiniteNumberField(event.required, 'required')
      assertFiniteNumberField(event.fuelUsed, 'fuelUsed')
      assertFiniteNumberField(event.woodToFuel, 'woodToFuel')
      assertStringArray(event.sickWorkerIds, 'sickWorkerIds')
      return
    case 'continuation.restored':
      if (
        event.reason !== 'commandRejected' &&
        event.reason !== 'protectedObservationRejected' &&
        event.reason !== 'scopeRollback'
      ) {
        throw new Error('GameEvent reason must be a known continuation restore reason')
      }
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
