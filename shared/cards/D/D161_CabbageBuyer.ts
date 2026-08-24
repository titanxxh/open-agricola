import { defineOccupationCard } from '../card-source'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData } from '../helpers/card-state'
import { cardCountsAs } from '../helpers/card-type'
import type { ActionFlow, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D161_CabbageBuyer'
/**
 * D161 Cabbage Buyer — Each time any player (including you) takes a
 * house-redevelopment action (renovate + optional improvement), you can
 * buy 1 <VEGETABLE> for 3/2/1 <FOOD> depending on whether no / minor /
 * major improvement was built.
 *
 * Implementation:
 *  (a) after:renovate-house — set tracker
 *  (b) after:improvement-any/minor-improvement — tag improvement kind
 *  (c) after:place-farmer — drain tracker, emit offer to owner
 */

// ── Tracker helpers ──────────────────────────────────────────────

type InFlight = {
  renovatorPId: string
  hasMajor: boolean
  hasMinor: boolean
}

const getInFlight = (owner: PlayerState): InFlight | undefined =>
  readCardExtraData<InFlight>(owner, CARD_ID, 'inFlight') ?? undefined

const setInFlightLeaf = (owner: PlayerState, value: InFlight | null): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: 'inFlight', value },
  actionContext: { targetPlayerId: owner.id },
})

const buildOfferFlow = (owner: PlayerState, cost: number): ActionFlow | undefined => {
  if ((owner.resources.food ?? 0) < cost) return undefined
  return {
    type: 'seq',
    optional: true,
    children: [
      payLeaf({ cardId: CARD_ID, cost: { food: cost } }),
      gainLeaf(CARD_ID, { vegetable: 1 }),
    ],
  }
}

const getBuiltCardId = (choice: string | undefined): string | undefined => {
  if (!choice) return undefined
  return choice.replace(/^major:/, '').replace(/^minor:/, '')
}

const isNormalRedevelopmentSpace = (spaceId: string | undefined) =>
  spaceId === 'house-redevelopment' || spaceId === 'farm-redevelopment'

const openTrackerListener: CardListenerRegistration = {
  id: 'D161-cabbage-buyer-open-tracker',
  cardIds: [CARD_ID],
  actions: ['renovate-house'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return

    if (context.sourceCard && !isNormalRedevelopmentSpace(context.space?.id)) {
      const flow = buildOfferFlow(owner, 3)
      if (!flow) return
      return {
        flow,
        sourceCard: CARD_ID,
      }
    }

    return {
      flow: setInFlightLeaf(owner, {
        renovatorPId: context.player.id,
        hasMajor: false,
        hasMinor: false,
      }),
      sourceCard: CARD_ID,
    }
  },
}

const tagImprovementListener: CardListenerRegistration = {
  id: 'D161-cabbage-buyer-tag-improvement',
  cardIds: [CARD_ID],
  actions: ['improvement'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return

    const inFlight = getInFlight(owner)
    if (!inFlight) return
    if (inFlight.renovatorPId !== context.player.id) return

    const builtCardId = getBuiltCardId(context.choice)
    if (!builtCardId) return

    const next = {
      ...inFlight,
      ...(cardCountsAs(builtCardId, 'major')
        ? { hasMajor: true }
        : { hasMinor: true }),
    }
    return {
      flow: setInFlightLeaf(owner, next),
      sourceCard: CARD_ID,
    }
  },
}

const drainTrackerListener: CardListenerRegistration = {
  id: 'D161-cabbage-buyer-drain-offer',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  scope: 'any',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner) return

    const inFlight = getInFlight(owner)
    if (!inFlight) return

    const cost = inFlight.hasMajor ? 1 : inFlight.hasMinor ? 2 : 3
    const flow = buildOfferFlow(owner, cost)
    return {
      flow: flow
        ? { type: 'seq', children: [setInFlightLeaf(owner, null), flow] }
        : setInFlightLeaf(owner, null),
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [openTrackerListener, tagImprovementListener, drainTrackerListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D161_CabbageBuyer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Cabbage Buyer',
    deck: 'D',
    number: 161,
    category: 'CROP_PROVIDER',
    desc: [
        'Each time any player (including you) renovates and then builds no/1 minor/1 major improvement, you can buy 1 <VEGETABLE> for 3/2/1 <FOOD>.',
      ],
    cost: {},
    players: '4+',
  },
  impl: cardImpl,
})

export const D161_CabbageBuyer_impl = D161_CabbageBuyer.impl
