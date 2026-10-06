import { defineMinorCard } from '../card-source'
import { readPrivateCardData, writePrivateCardData } from '../helpers/card-state'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { passOccupationToNextPlayer } from '../helpers/pass-occupation'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { cardEffectHandChangedEvent } from '../../session/private-hand-events'

const CARD_ID = 'B003_Moonshine'

const KEY_OCC = 'occ'

const cardImpl = {
  effect: {
  id: CARD_ID,
  projectInteractionRequest: (_state, player, request, actionId) =>
    actionId === 'emit-choice' && request.kind === 'choice' ? {
      ...request,
      options: request.options.map((option) => option.value === 'play' ? {
        ...option,
        disabled: player.resources.food < 2,
        disabledReasonKey: player.resources.food < 2 ? `cards.${CARD_ID}.choicePlayDisabled` : undefined,
      } : option),
    } : request,

  onBuy: (state, player, _paymentInfo, ctx) => {
    if (player.occupationHand.length === 0) return

    // The revealed occupation belongs to this player's private state.
    const pick = rollAndCacheCardPick(
      state,
      player,
      CARD_ID,
      KEY_OCC,
      player.occupationHand,
      ctx?.reportProtectedObservation,
      'player-private',
    )

    state.pendingUndoBoundary = true

    const canPlay = (player.resources.food ?? 0) >= 2

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'emit-choice',
      sourceCard: CARD_ID,
      params: {
        promptKey: 'cards.B003_Moonshine.choice',
        promptParams: { cardId: pick },
        options: [
          {
            value: 'play',
            labelKey: 'cards.B003_Moonshine.choicePlay',
            sourceCard: CARD_ID,
            disabled: !canPlay,
            ...(canPlay ? {} : { disabledReasonKey: 'cards.B003_Moonshine.choicePlayDisabled' }),
          },
          {
            value: 'pass',
            labelKey: 'cards.B003_Moonshine.choicePass',
            sourceCard: CARD_ID,
          },
        ],
      },
    }
    return flow
  },

  resolveChoice: (state, player, choice, ctx) => {
    const pick = readPrivateCardData<string>(player, CARD_ID, KEY_OCC)
    if (!pick) return

    if (choice === 'play') {
      writePrivateCardData(player, CARD_ID, KEY_OCC, undefined)
      return {
        type: 'leaf',
        actionId: 'occupation',
        sourceCard: CARD_ID,
        params: { exactCost: { food: 2 }, allowedCards: [pick] },
      } satisfies ActionFlow
    }

    if (choice === 'pass') {
      const result = passOccupationToNextPlayer(state, player, pick)
      if (result.cardId) {
        if (result.target === 'next') {
          ctx.reportProtectedObservation?.({
            kind: 'hidden-information',
            recipientPlayerIds: [result.targetPlayerId],
          })
        }
        ctx.emitPrivateEvent?.(cardEffectHandChangedEvent(
          result.fromPlayerId,
          [result.cardId],
          'occupation',
          CARD_ID,
        ))
        if (result.target === 'next') {
          ctx.emitPrivateEvent?.(cardEffectHandChangedEvent(
            result.targetPlayerId,
            [result.cardId],
            'occupation',
            CARD_ID,
          ))
        }
      }
      writePrivateCardData(player, CARD_ID, KEY_OCC, undefined)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl

export const B003_Moonshine = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Moonshine',
    deck: 'B',
    number: 3,
    category: 'ACTIONS_BOOSTER',
    desc: [
        'Randomly select an occupation in your hand. Either play it for an occupation cost of 2 <FOOD>, or give it to the next player.',
      ],
    cost: {},
    passing: true,
  },
  impl: cardImpl,
})

export const B003_Moonshine_impl = B003_Moonshine.impl
