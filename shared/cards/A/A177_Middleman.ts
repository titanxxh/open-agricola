import { defineOccupationCard } from '../card-source'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { MEEPLE_SYMBOL_SPACE_IDS } from '../helpers/action-space-categories'
import {
  ACTION_SPACE_ATTACHMENTS_KEY,
  getActionSpaceAttachments,
  readCardExtraData,
  type ActionSpaceAttachment,
} from '../helpers/card-state'
import { ownerSpecialEffect } from '../helpers/action-space-tokens'
import { gainLeaf } from '../helpers/pay-gain-node'
import { getRoundPlacementDetails } from '../helpers/round-placement'

const CARD_ID = 'A177_Middleman'
const SKIP_PLACEMENT_KEY = 'skipPlacementKey'
const ATTACHED_RESOURCES = { stone: 1, food: 1 } as const

const buildInitialAttachments = (
  actionSpaces: readonly { id: string }[],
): ActionSpaceAttachment[] => {
  const currentIds = new Set(actionSpaces.map((space) => space.id))
  return MEEPLE_SYMBOL_SPACE_IDS
    .filter((spaceId) => currentIds.has(spaceId))
    .map((spaceId) => ({
      spaceId,
      resources: ATTACHED_RESOURCES,
    }))
}

const placementKey = (round: number, placementCount: number, spaceId: string): string =>
  `${round}:${placementCount}:${spaceId}`

const afterOwnerUsesAttachedSpace: CardListenerRegistration = {
  id: 'A177-middleman-after-owner-attached-space',
  cardIds: [CARD_ID],
  actions: ['place-farmer'],
  phases: ['after' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const spaceId = context.space?.id
    if (!spaceId) return
    const placements = getRoundPlacementDetails(context.player)
    const currentPlacementKey = placementKey(context.state.round, placements.length, spaceId)
    if (readCardExtraData<string>(context.player, CARD_ID, SKIP_PLACEMENT_KEY) === currentPlacementKey) {
      return {
        flow: ownerSpecialEffect(CARD_ID, context.player.id, {
          kind: 'set-extra-data',
          key: SKIP_PLACEMENT_KEY,
          value: undefined,
        }),
        countCardUse: false,
        sourceCard: CARD_ID,
      }
    }
    const attachments = getActionSpaceAttachments(context.player, CARD_ID)
    const attachment = attachments.find((entry) => entry.spaceId === spaceId)
    if (!attachment) return
    const remaining = attachments.filter((entry) => entry.spaceId !== spaceId)
    return {
      flow: {
        type: 'seq',
        children: [
          ownerSpecialEffect(CARD_ID, context.player.id, {
            kind: 'set-extra-data',
            key: ACTION_SPACE_ATTACHMENTS_KEY,
            value: remaining,
          }),
          gainLeaf(CARD_ID, attachment.resources),
        ],
      },
      sourceCard: CARD_ID,
    }
  },
}

const cardImpl = {
  listeners: [afterOwnerUsesAttachedSpace],
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const attachments = buildInitialAttachments(state.actionSpaces)
      if (attachments.length === 0) return
      const placements = getRoundPlacementDetails(player)
      const lastPlacement = placements.at(-1)
      const children: ActionFlow[] = [
        {
          type: 'leaf' as const,
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: {
            kind: 'set-extra-data',
            key: ACTION_SPACE_ATTACHMENTS_KEY,
            value: attachments,
          },
        },
      ]
      if (lastPlacement) {
        children.push({
          type: 'leaf',
          actionId: 'special-effect',
          sourceCard: CARD_ID,
          params: {
            kind: 'set-extra-data',
            key: SKIP_PLACEMENT_KEY,
            value: placementKey(state.round, placements.length, lastPlacement.spaceId),
          },
        })
      }
      return {
        type: 'seq',
        children,
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const A177_Middleman = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Middleman',
    deck: 'A',
    number: 177,
    category: 'BUILDING_RESOURCE_PROVIDER',
    desc: ['Place 1 stone and 1 food on all action spaces with the (meeple) symbol on the game board extension. Next time you place a person on them, you get the goods.'],
    cost: {},
    players: '5+',
  },
  impl: cardImpl,
})

export const A177_Middleman_impl = A177_Middleman.impl
