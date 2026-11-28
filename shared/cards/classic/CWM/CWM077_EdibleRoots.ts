import type {
  DraftGameEvent,
  FarmCropAddedEvent,
  FarmCropRemovedEvent,
  FarmSownEvent,
  GameEvent,
  ResourceMovedEvent,
} from '../../../contract/events'
import type { CardListenerContext } from '../../card-listeners'
import { defineMinorCard } from '../../card-source'
import { getLogicalFields, type LogicalField } from '../../helpers/card-field'
import { gainLeaf } from '../../helpers/pay-gain-node'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM077_EdibleRoots'

type AnyEvent = GameEvent | CardListenerContext['transactionEvents'][number]
type QueryableResourceMovedEvent = ResourceMovedEvent | DraftGameEvent<'resource.moved'>

const isResourceMovedEvent = (event: AnyEvent): event is QueryableResourceMovedEvent =>
  event.type === 'resource.moved'

const isReapSupplyMove = (
  event: AnyEvent,
  playerId: string,
): event is QueryableResourceMovedEvent =>
  isResourceMovedEvent(event)
  && event.reason === 'reap'
  && event.to.kind === 'player'
  && event.to.playerId === playerId

const currentReapAndPostEvents = (
  context: CardListenerContext,
): { reapMoves: QueryableResourceMovedEvent[]; postEvents: AnyEvent[] } => {
  const playerId = context.player.id
  const actionEvents = context.actionEvents ?? []
  const fromAction = actionEvents.filter((event) => isReapSupplyMove(event, playerId))
  if (fromAction.length > 0) {
    const txEvents = context.transactionEvents ?? []
    let lastReapIdx = -1
    txEvents.forEach((event, index) => {
      if (isReapSupplyMove(event, playerId)) lastReapIdx = index
    })
    return {
      reapMoves: fromAction,
      postEvents: lastReapIdx >= 0 ? txEvents.slice(lastReapIdx + 1) : [],
    }
  }
  const triggerPhase = (context.extraData?.trigger as { phase?: unknown } | undefined)?.phase
  if (triggerPhase !== 'harvest') return { reapMoves: [], postEvents: [] }
  const committed = context.state.events ?? []
  const reapMoves = committed.filter(
    (event): event is ResourceMovedEvent =>
      isReapSupplyMove(event, playerId)
      && event.round === context.state.round
      && event.actorPlayerId === playerId
      && event.trigger?.phase === 'harvest',
  )
  if (reapMoves.length === 0) return { reapMoves: [], postEvents: [] }
  const maxReapSeq = Math.max(...reapMoves.map((event) => event.seq))
  const committedAfter = committed.filter((event) => event.seq > maxReapSeq)
  const committedIds = new Set(committedAfter.map((event) => event.id))
  const uncommittedAfter = (context.transactionEvents ?? []).filter(
    (event) => !('id' in event && typeof event.id === 'string' && committedIds.has(event.id)),
  )
  return {
    reapMoves,
    postEvents: [...committedAfter, ...uncommittedAfter],
  }
}

const findFieldForOrigin = (
  fields: readonly LogicalField[],
  origin: { kind: string; row?: number; col?: number; cardId?: string },
): LogicalField | undefined => {
  if (origin.kind === 'field') {
    return fields.find(
      (field) => field.kind === 'farmyard' && field.row === origin.row && field.col === origin.col,
    )
  }
  if (origin.kind === 'card' && origin.cardId) {
    return fields.find((field) => field.kind === 'card' && field.sourceCard === origin.cardId)
  }
  return undefined
}

const netPostReapDelta = (
  fields: readonly LogicalField[],
  postEvents: readonly AnyEvent[],
): Map<string, number> => {
  const deltaByFieldId = new Map<string, number>()
  const add = (fieldId: string, delta: number) => {
    deltaByFieldId.set(fieldId, (deltaByFieldId.get(fieldId) ?? 0) + delta)
  }
  for (const event of postEvents) {
    if (event.type === 'farm.sown') {
      for (const sow of (event as FarmSownEvent | DraftGameEvent<'farm.sown'>).sows) {
        const field = findFieldForOrigin(fields, sow.location)
        if (field) add(field.id, sow.added)
      }
    } else if (event.type === 'farm.cropAdded') {
      const cropAdded = event as FarmCropAddedEvent | DraftGameEvent<'farm.cropAdded'>
      if (cropAdded.reason !== 'sow') {
        for (const crop of cropAdded.crops) {
          const field = findFieldForOrigin(fields, crop.location)
          if (field) add(field.id, crop.amount)
        }
      }
    } else if (event.type === 'farm.cropRemoved') {
      const cropRemoved = event as FarmCropRemovedEvent | DraftGameEvent<'farm.cropRemoved'>
      if (cropRemoved.reason !== 'reap') {
        for (const crop of cropRemoved.crops) {
          const field = findFieldForOrigin(fields, crop.location)
          if (field) add(field.id, -crop.amount)
        }
      }
    }
  }
  return deltaByFieldId
}

const cardImpl = {
  prerequisiteCheck: (player) => getLogicalFields(player).length >= 3,
  listeners: [
    {
      id: `${CARD_ID}-last-crop`,
      cardIds: [CARD_ID],
      actions: ['reap'],
      phases: ['after'],
      handler: (context) => {
        const fields = getLogicalFields(context.player)
        const { reapMoves, postEvents } = currentReapAndPostEvents(context)
        if (reapMoves.length === 0) return
        const postDeltas = netPostReapDelta(fields, postEvents)
        const emptiedFieldIds = new Set<string>()
        for (const event of reapMoves) {
          const field = findFieldForOrigin(fields, event.from)
          if (!field) continue
          const currentRemaining = field.stacks.reduce((sum, stack) => sum + stack.remaining, 0)
          const remainingAtReapEnd = currentRemaining - (postDeltas.get(field.id) ?? 0)
          if (remainingAtReapEnd === 0) {
            emptiedFieldIds.add(field.id)
          }
        }
        if (emptiedFieldIds.size === 0) return
        return {
          sourceCard: CARD_ID,
          flow: gainLeaf(CARD_ID, { food: emptiedFieldIds.size }),
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM077_EdibleRoots = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Edible Roots',
    deck: 'CWM',
    number: 77,
    cost: {},
    vp: 0,
    prerequisite: '3 fields',
    desc: [
      'Whenever you harvest the last good from a <FIELD> and place it in your supply, you receive 1 <FOOD>.',
    ],
    artUrl: 'assets/classic/CWM/CWM077.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM077_EdibleRoots_impl = CWM077_EdibleRoots.impl
