import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import type {
  CardStackChangedEvent,
  DraftGameEvent,
  PaymentPurpose,
  ResourcePaidEvent,
} from '../../../contract/events'
import type { Bonus, BonusChoice, PlayerState } from '../../../contract/types'
import type { QueryableGameEvent } from '../../../events/query'
import type { CardListenerContext } from '../../card-listeners'
import { defineOccupationCard } from '../../card-source'
import { incCounter, initCardState } from '../../helpers/card-state'
import { getRoomsBuiltThisAction } from '../../helpers/construction-events'
import { sumActualPaidResource } from '../../helpers/event-provenance'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM018_ExpertBuilder'
const STORE_ACTION_ID = 'card_CWM018_ExpertBuilder_store'
const SPEND_ACTION_ID = 'card_CWM018_ExpertBuilder_spend'
const BUILDING_RESOURCES = ['wood', 'clay', 'reed', 'stone'] as const
type BuildingResource = (typeof BUILDING_RESOURCES)[number]

const isResourcePaidEvent = (
  event: QueryableGameEvent,
): event is ResourcePaidEvent | DraftGameEvent<'resource.paid'> =>
  event.type === 'resource.paid'

const isCardStackChangedEvent = (
  event: QueryableGameEvent,
): event is CardStackChangedEvent | DraftGameEvent<'card.stackChanged'> =>
  event.type === 'card.stackChanged'

registerAdHocAction({
  id: STORE_ACTION_ID,
  nameKey: 'actions.store-on-card.name',
  descriptionKey: 'actions.store-on-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, params, eventSink }) => {
    const owner = state.players.find((p) => p.id === params?.ownerId)
    const resource = params?.resource as BuildingResource | undefined
    if (!owner || !resource || !BUILDING_RESOURCES.includes(resource)) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    incCounter(owner, CARD_ID, resource, 1)
    eventSink?.emit<'resource.moved'>({
      type: 'resource.moved',
      resources: { [resource]: 1 },
      from: { kind: 'supply' },
      to: { kind: 'card', playerId: owner.id, cardId: CARD_ID },
      reason: 'cardEffect',
      sourceCardId: CARD_ID,
    })
    return { type: 'ok' }
  },
})

registerAdHocAction({
  id: SPEND_ACTION_ID,
  nameKey: 'actions.pay.name',
  descriptionKey: 'actions.pay.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, eventSink }) => {
    const rawSpent = params?.spent
    if (!rawSpent || typeof rawSpent !== 'object') {
      return { type: 'fail', errorKey: 'log.payFail' }
    }
    const paymentFor: PaymentPurpose =
      typeof params?.paymentFor === 'string'
        ? (params.paymentFor as PaymentPurpose)
        : 'cardEffect'
    const counters = initCardState(player, CARD_ID)
    const spent: Partial<Record<BuildingResource, number>> = {}
    for (const resource of BUILDING_RESOURCES) {
      const rawAmount = (rawSpent as Record<string, unknown>)[resource]
      if (typeof rawAmount !== 'number' || rawAmount <= 0) continue
      const available = counters[resource] ?? 0
      if (available < rawAmount) {
        return { type: 'fail', errorKey: 'log.payFail' }
      }
      counters[resource] = available - rawAmount
      spent[resource] = rawAmount
    }
    const keys = Object.keys(spent)
    if (keys.length === 0) return { type: 'ok' }
    eventSink?.emit<'resource.paid'>({
      type: 'resource.paid',
      resources: spent,
      paymentFor,
      paymentSources: [{ from: { kind: 'card', playerId: player.id, cardId: CARD_ID }, resources: spent }],
      to: { kind: 'supply' },
      sourceCardId: CARD_ID,
    })
    for (const key of keys) {
      eventSink?.emit<'card.stateChanged'>({
        type: 'card.stateChanged',
        sourceCardId: CARD_ID,
        cardId: CARD_ID,
        targetPlayerId: player.id,
        key,
      })
    }
    return { type: 'ok', resourcesPaid: spent }
  },
})

const buildDiscountChoices = (player: PlayerState): BonusChoice[] => {
  const counters = player.cardStates[CARD_ID]?.counters ?? {}
  let partials: Array<Partial<Record<BuildingResource, number>>> = [{}]
  for (const resource of BUILDING_RESOURCES) {
    const available = Math.max(0, Math.floor(counters[resource] ?? 0))
    if (available <= 0) continue
    const next: Array<Partial<Record<BuildingResource, number>>> = []
    for (const current of partials) {
      for (let used = 0; used <= available; used += 1) {
        next.push(used > 0 ? { ...current, [resource]: used } : { ...current })
      }
    }
    partials = next
  }
  return partials
    .filter((discount) => Object.keys(discount).length > 0)
    .map((discount) => ({ discount }))
}

const collectConstructPaymentEvents = (
  context: CardListenerContext,
  actorId: string,
): QueryableGameEvent[] => {
  const actionEvents = context.actionEvents ?? []
  const anchorSeqs = actionEvents.flatMap((event) =>
    (event.type === 'farm.roomBuilt' || (isResourcePaidEvent(event) && event.paymentFor === 'construct'))
      && 'seq' in event
      && typeof event.seq === 'number'
      ? [event.seq]
      : [],
  )
  if (anchorSeqs.length === 0) return [...actionEvents]
  const minSeq = Math.min(...anchorSeqs)
  const seenIds = new Set(
    actionEvents.flatMap((event) => ('id' in event && typeof event.id === 'string' ? [event.id] : [])),
  )
  const committedFollowUps = (context.state.events ?? []).filter(
    (event) =>
      event.seq >= minSeq
      && !seenIds.has(event.id)
      && (event.actorPlayerId === actorId || event.targetPlayerId === actorId),
  )
  return [...actionEvents, ...committedFollowUps]
}

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-store`,
      cardIds: [CARD_ID],
      actions: ['construct'],
      phases: ['after'],
      scope: 'any',
      mandatory: true,
      handler: (context) => {
        const actor = context.triggerPlayer ?? context.player
        const owner = context.ownerPlayer ?? context.player
        if (getRoomsBuiltThisAction(context, actor.id) < 1) return
        const constructEvents = collectConstructPaymentEvents(context, actor.id)
        const paidKinds = BUILDING_RESOURCES.filter(
          (resource) =>
            sumActualPaidResource(
              constructEvents,
              resource,
              (event) => event.paymentFor === 'construct',
            ) > 0
            || constructEvents.some(
              (event) =>
                isCardStackChangedEvent(event)
                && (event.delta ?? 0) < 0
                && event.targetPlayerId === actor.id
                && (event.resources?.[resource] ?? 0) > 0,
            ),
        )
        if (paidKinds.length === 0) return
        if (paidKinds.length === 1) {
          return {
            sourceCard: CARD_ID,
            flow: {
              type: 'leaf',
              actionId: STORE_ACTION_ID,
              sourceCard: CARD_ID,
              targetPlayerId: actor.id,
              params: { resource: paidKinds[0]!, ownerId: owner.id },
            },
          }
        }
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            targetPlayerId: actor.id,
            children: paidKinds.map((resource) => ({
              type: 'leaf' as const,
              actionId: STORE_ACTION_ID,
              sourceCard: CARD_ID,
              choiceLabelKey: `resources.${resource}`,
              params: { resource, ownerId: owner.id },
            })),
          },
        }
      },
    },
    {
      id: `${CARD_ID}-compute-costs`,
      cardIds: [CARD_ID],
      actions: ['construct', 'renovate-house'],
      phases: ['computeCosts'],
      handler: (context) => {
        const choices = buildDiscountChoices(context.player)
        if (choices.length === 0) return
        const bonus: Bonus = {
          choices,
          optional: true,
          choiceAffectsState: true,
          sources: [CARD_ID],
        }
        return { bonuses: [bonus] }
      },
    },
    {
      id: `${CARD_ID}-after-pay`,
      cardIds: [CARD_ID],
      actions: ['pay'],
      phases: ['after'],
      mandatory: true,
      handler: (context) => {
        const payment = context.eventQuery.find(
          'resource.paid',
          (event) => event.bonusSources?.includes(CARD_ID) === true,
        )
        if (!payment) return
        const choices = buildDiscountChoices(context.player)
        const choiceIndex = payment.bonusChoiceIndex?.[CARD_ID]
        const chosen = typeof choiceIndex === 'number' ? choices[choiceIndex] : undefined
        if (!chosen?.discount || Object.keys(chosen.discount).length === 0) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'leaf',
            actionId: SPEND_ACTION_ID,
            sourceCard: CARD_ID,
            countCardUse: false,
            params: { spent: chosen.discount, paymentFor: payment.paymentFor },
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM018_ExpertBuilder = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Expert Builder',
    deck: 'CWM',
    number: 18,
    players: '3+',
    cost: {},
    vp: 0,
    desc: [
      'Whenever any player (including you) builds 1 or more rooms, they must place 1 resource of those paid on this card. You may use these resources to pay for your extensions or renovations.',
    ],
    artUrl: 'assets/classic/CWM/CWM018.png',
    implemented: true,
  },
  presentation: { counters: ['wood', 'clay', 'reed', 'stone'] },
  impl: cardImpl,
})

export const CWM018_ExpertBuilder_impl = CWM018_ExpertBuilder.impl
