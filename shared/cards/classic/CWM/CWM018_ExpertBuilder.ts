import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { incCounter } from '../../helpers/card-state'
import { getRoomsBuiltThisAction } from '../../helpers/construction-events'
import { sumActualPaidResource } from '../../helpers/event-provenance'

const CARD_ID = 'CWM018_ExpertBuilder'

const kinds = ['wood', 'clay', 'reed', 'stone'] as const
const STORE = 'card_' + CARD_ID + '_store'
registerAdHocAction({
  id: STORE,
  nameKey: 'actions.store-on-card.name',
  descriptionKey: 'actions.store-on-card.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, params, eventSink }) => {
    const owner = state.players.find((p) => p.id === params?.ownerId),
      resource = params?.resource as (typeof kinds)[number]
    if (!owner || !kinds.includes(resource)) return { type: 'fail', errorKey: 'log.action' }
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
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-store',
      cardIds: [CARD_ID],
      actions: ['construct'],
      phases: ['after'],
      scope: 'any',
      mandatory: true,
      handler: (context) => {
        if (getRoomsBuiltThisAction(context) < 1) return
        const owner = context.ownerPlayer ?? context.player,
          actor = context.triggerPlayer ?? context.player
        const paidKinds = kinds.filter(
          (resource) =>
            sumActualPaidResource(
              context.actionEvents ?? [],
              resource,
              (event) => event.paymentFor === 'construct',
            ) > 0,
        )
        if (!paidKinds.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            targetPlayerId: actor.id,
            children: paidKinds.map((resource) => ({
              type: 'leaf',
              actionId: STORE,
              sourceCard: CARD_ID,
              choiceLabelKey: `resources.${resource}`,
              params: { resource, ownerId: owner.id },
            })),
          },
        }
      },
    },
    {
      id: CARD_ID + '-spend',
      cardIds: [CARD_ID],
      actions: ['construct', 'renovate-house'],
      phases: ['computeCosts'],
      handler: ({ player }) => ({
        sourceCard: CARD_ID,
        paymentResourceProviders: kinds
          .filter((resource) => (player.cardStates[CARD_ID]?.counters?.[resource] ?? 0) > 0)
          .map((resource) => ({
            key: `${CARD_ID}:${resource}`,
            sourceCard: CARD_ID,
            available: player.cardStates[CARD_ID]!.counters![resource]!,
            covers: [{ resource, costAmount: 1, paymentAmount: 1 }],
            consume: {
              type: 'cardCounter',
              playerId: player.id,
              cardId: CARD_ID,
              counterKey: resource,
              resource,
            },
          })),
      }),
    },
  ],
} satisfies CardImpl

export const CWM018_ExpertBuilder = defineOccupationCard({
  meta: {
    id: 'CWM018_ExpertBuilder',
    name: "Expert Builder",
    deck: 'CWM',
    number: 18,
    desc: ["Whenever any player builds at least 1 room, that player must place one of the building resources actually paid on this card. You may spend resources on this card to build rooms or renovate."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM018.png',
  },
  presentation: { counters: ['wood', 'clay', 'reed', 'stone'] },
  impl: cardImpl,
})

export const CWM018_ExpertBuilder_impl = CWM018_ExpertBuilder.impl
