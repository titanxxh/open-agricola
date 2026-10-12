import { defineOccupationCard } from '../card-source'
import type {
  ActionFlow,
  Resource,
  PlayerState,
} from '../../contract/types'
import { createImprovementCountRecordSelection, improvementCountRecordSelectionCount } from '../../actions/plans/card-record-selection'
import { createCardRecordClaimActions } from '../../actions/plans/card-record-claim'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import {
  readCardExtraData,
} from '../helpers/card-state'
import type { CardImpl } from '../registry'

const CARD_ID = 'C146_WorkshopAssistant'
const CHOOSE_PAIRS_ACTION_ID = 'card_C146_WorkshopAssistant_choosePairs'
const TAKE_PAIR_ACTION_ID = 'card_C146_WorkshopAssistant_takePair'
const COMMIT_TAKE_PAIR_ACTION_ID = 'card_C146_WorkshopAssistant_commitTakePair'

const PAIRS = [
  ['WC', { wood: 1, clay: 1 }],
  ['WR', { wood: 1, reed: 1 }],
  ['WS', { wood: 1, stone: 1 }],
  ['CR', { clay: 1, reed: 1 }],
  ['CS', { clay: 1, stone: 1 }],
  ['RS', { reed: 1, stone: 1 }],
] as const

const PAIR_RESOURCES: Record<string, Partial<Resource>> = Object.fromEntries(
  PAIRS.map(([k, res]) => [k, res]),
)

const readStoredPairs = (player: PlayerState): string[] => readCardExtraData<string[]>(player, CARD_ID, 'pairs') ?? []

registerAdHocAction(createImprovementCountRecordSelection(CARD_ID, CHOOSE_PAIRS_ACTION_ID, PAIR_RESOURCES, 'pairs'))

createCardRecordClaimActions(CARD_ID, 'pairs', PAIR_RESOURCES, TAKE_PAIR_ACTION_ID, COMMIT_TAKE_PAIR_ACTION_ID).forEach(registerAdHocAction)

const opponentRenovationListener: CardListenerRegistration = {
  id: 'C146-workshop-assistant-after-opponent-renovation',
  cardIds: [CARD_ID],
  phases: ['after' as ActionHookPhase],
  actions: ['renovate-house'],
  scope: 'opponent',
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const owner = context.ownerPlayer
    if (!owner || owner.id === context.player.id) return
    const pairs = readStoredPairs(owner)
    if (pairs.length === 0) return
    if (pairs.length === 1) {
      return {
        flow: {
          type: 'leaf',
          actionId: TAKE_PAIR_ACTION_ID,
          params: { pair: pairs[0] },
          sourceCard: CARD_ID,
          optional: true,
        },
        sourceCard: CARD_ID,
        countCardUse: false,
      }
    }
    return {
      flow: {
        type: 'xor',
        optional: true,
        children: pairs.map((pair) => ({
          type: 'leaf' as const,
          actionId: TAKE_PAIR_ACTION_ID,
          params: { pair },
          sourceCard: CARD_ID,
        })),
      },
      sourceCard: CARD_ID,
      countCardUse: false,
    }
  },
}

const cardImpl = {
  effect: {
  id: CARD_ID,
  getStatePresentation: (player) => ({
    resourceGroups: readStoredPairs(player).flatMap((pair) => PAIR_RESOURCES[pair] ? [{ ...PAIR_RESOURCES[pair] }] : []),
  }),
    onBuy: (_state, player) => {
      const n = improvementCountRecordSelectionCount(player, PAIR_RESOURCES)
      if (n <= 0) return
      const flow: ActionFlow = {
        type: 'leaf',
        actionId: CHOOSE_PAIRS_ACTION_ID,
        sourceCard: CARD_ID,
      }
      return flow
    },
  },
  listeners: [opponentRenovationListener],
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C146_WorkshopAssistant = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Workshop Assistant",
    deck: "C",
    number: 146,
    category: "GOODS_PROVIDER",
    desc: [
        'Place unique pairs of different building resources on this card, one for each improvement you have built. Each time another player renovates, you may move one such pair to your supply.',
      ],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const C146_WorkshopAssistant_impl = C146_WorkshopAssistant.impl
