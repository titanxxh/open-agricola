import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { rollAndCacheCardPick } from '../helpers/card-random'
import { passOccupationToNextPlayer } from '../helpers/pass-occupation'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'
import { B3_Moonshine } from '../../cards-display/B/B3_Moonshine'

const CARD_ID = B3_Moonshine.id

const KEY_OCC = 'occ'

export const B3_Moonshine_impl = {
  effect: {
  id: CARD_ID,

  onBuy: (state, player) => {
    if (player.occupationHand.length === 0) return

    // Roll and cache via Task-1.1 helper (writes to extraData.occ).
    rollAndCacheCardPick(state, player, CARD_ID, KEY_OCC, player.occupationHand)

    state.pendingUndoBoundary = true

    const canPlay = (player.resources.food ?? 0) >= 2

    const flow: ActionFlow = {
      type: 'leaf',
      actionId: 'emit-choice',
      sourceCard: CARD_ID,
      params: {
        promptKey: 'cards.B3_Moonshine.choice',
        options: [
          {
            value: 'play',
            labelKey: 'cards.B3_Moonshine.choicePlay',
            sourceCard: CARD_ID,
            disabled: !canPlay,
            ...(canPlay ? {} : { disabledReasonKey: 'cards.B3_Moonshine.choicePlayDisabled' }),
          },
          {
            value: 'pass',
            labelKey: 'cards.B3_Moonshine.choicePass',
            sourceCard: CARD_ID,
          },
        ],
      },
    }
    return flow
  },

  resolveChoice: (state, player, choice, _ctx) => {
    const pick = readCardExtraData<string>(player, CARD_ID, KEY_OCC)
    if (!pick) return

    if (choice === 'play') {
      writeCardExtraData(player, CARD_ID, KEY_OCC, undefined)
      return {
        type: 'leaf',
        actionId: 'play-occupation',
        sourceCard: CARD_ID,
        params: { costOverride: { food: 2 }, allowedCards: [pick] },
      } satisfies ActionFlow
    }

    if (choice === 'pass') {
      passOccupationToNextPlayer(state, player, pick)
      writeCardExtraData(player, CARD_ID, KEY_OCC, undefined)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
