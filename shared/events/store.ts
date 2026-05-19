import type { DraftGameEvent, EventSink, GameEvent } from '../contract/events'
import type { GameState } from '../contract/types'
import { assertEventSizeUnderLimit, assertJsonSafeEvent, assertPublicGameEvent } from './guards'

export type EventEnvelopeContext = {
  actorPlayerId?: string
  targetPlayerId?: string
  sourceActionId?: string
  sourceCardId?: string
  trigger?: GameEvent['trigger']
}

export type EventStoreSnapshot = {
  inTransaction: boolean
  transactionEvents: GameEvent[]
}

export class EventStoreFrame {
  private drafts: DraftGameEvent[] = []
  private readonly store: EventStore
  private readonly defaults: EventEnvelopeContext
  private readonly transactionToken: number

  constructor(store: EventStore, defaults: EventEnvelopeContext, transactionToken: number) {
    this.store = store
    this.defaults = defaults
    this.transactionToken = transactionToken
  }

  readonly sink: EventSink = {
    emit: (event) => {
      this.drafts.push(event)
    },
    emitMany: (events) => {
      events.forEach((event) => this.sink.emit(event))
    },
  }

  complete(state: GameState): GameEvent[] {
    const completed = this.store.completeFrame(state, this.drafts, this.defaults, this.transactionToken)
    this.drafts = []
    return completed
  }

  rollback(): void {
    this.drafts = []
  }
}

export class EventStore {
  private transactionEvents: GameEvent[] = []
  private inTransaction = false
  private transactionToken = 0

  beginTransaction(): void {
    if (this.inTransaction) {
      throw new Error('Event transaction is already open')
    }
    this.transactionEvents = []
    this.inTransaction = true
    this.transactionToken += 1
  }

  ensureTransaction(): void {
    if (!this.inTransaction) this.beginTransaction()
  }

  beginFrame(defaults: EventEnvelopeContext = {}): EventStoreFrame {
    this.ensureTransaction()
    return new EventStoreFrame(this, defaults, this.transactionToken)
  }

  currentTransactionEvents(): readonly GameEvent[] {
    return this.transactionEvents
  }

  snapshot(): EventStoreSnapshot {
    return {
      inTransaction: this.inTransaction,
      transactionEvents: this.transactionEvents.map((event) => ({ ...event })),
    }
  }

  restore(snapshot?: EventStoreSnapshot | null): void {
    if (!snapshot?.inTransaction) {
      this.rollbackTransaction()
      return
    }
    this.transactionEvents = snapshot.transactionEvents.map((event) => ({ ...event }))
    this.inTransaction = true
    this.transactionToken += 1
  }

  commitTransaction(state: GameState): GameEvent[] {
    const committed = [...this.transactionEvents]
    state.events.push(...committed)
    state.nextEventSeq += committed.length
    this.rollbackTransaction()
    return committed
  }

  rollbackTransaction(): void {
    this.transactionEvents = []
    this.inTransaction = false
  }

  completeFrame(
    state: GameState,
    drafts: readonly DraftGameEvent[],
    defaults: EventEnvelopeContext,
    transactionToken: number,
  ): GameEvent[] {
    if (!this.inTransaction || transactionToken !== this.transactionToken) {
      throw new Error('Event transaction is not open for this frame')
    }
    const offset = this.transactionEvents.length
    const completed = drafts.map((draft, index) => this.completeDraft(state, draft, defaults, offset + index))
    this.transactionEvents.push(...completed)
    return completed
  }

  private completeDraft(
    state: GameState,
    draft: DraftGameEvent,
    defaults: EventEnvelopeContext,
    offset: number,
  ): GameEvent {
    const seq = state.nextEventSeq + offset
    const details = { ...draft } as Record<string, unknown>
    const actorPlayerId = details.actorPlayerId as string | undefined
    const targetPlayerId = details.targetPlayerId as string | undefined
    const sourceActionId = details.sourceActionId as string | undefined
    const sourceCardId = details.sourceCardId as string | undefined
    const trigger = details.trigger as GameEvent['trigger'] | undefined
    delete details.actorPlayerId
    delete details.targetPlayerId
    delete details.sourceActionId
    delete details.sourceCardId
    delete details.trigger
    delete details.visibility
    const event = {
      schemaVersion: 1,
      id: String(seq),
      seq,
      round: state.round,
      phase: state.roundPhase,
      visibility: 'public',
      ...details,
    } as Record<string, unknown>
    const envelope = {
      actorPlayerId: actorPlayerId ?? defaults.actorPlayerId,
      targetPlayerId: targetPlayerId ?? defaults.targetPlayerId,
      sourceActionId: sourceActionId ?? defaults.sourceActionId,
      sourceCardId: sourceCardId ?? defaults.sourceCardId,
      trigger: trigger ?? defaults.trigger,
    }
    Object.entries(envelope).forEach(([key, value]) => {
      if (value !== undefined) event[key] = value
    })
    assertPublicGameEvent(event)
    assertJsonSafeEvent(event)
    assertEventSizeUnderLimit(event, 4096)
    return event as GameEvent
  }
}
