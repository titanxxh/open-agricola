import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { gainLeaf, payLeaf } from '../../helpers/pay-gain-node'
import { discardHandCards } from '../../helpers/hand-discard'
import { playerHasCardCapability } from '../../helpers/card-type'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { cardIdentityChoice } from '../../../actions/helpers/card-choice'
import { cardEffectHandChangedEvent } from '../../../session/private-hand-events'

const CARD_ID = 'CFL034_FranciscanMonk'

const DISCARD = 'card_CFL034_FranciscanMonk_discard'
registerAdHocAction({
  id: DISCARD,
  nameKey: 'actions.discard-from-hand.name',
  descriptionKey: 'actions.discard-from-hand.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    player.minorHand.length > 0 && !playerHasCardCapability(player, 'preventsHandDiscard'),
  execute: ({ player }) => ({
    type: 'request',
    request: {
      kind: 'choice',
      options: player.minorHand.map((id) => cardIdentityChoice(id, 'minor', id)),
    },
    promptKey: 'ui.interactionDiscardFromHand',
  }),
  resolveChoice: ({ player, emitPrivateEvent }, choice) => {
    if (!discardHandCards(player, 'minor', [choice]))
      return { type: 'fail', errorKey: 'log.actionFail' }
    emitPrivateEvent?.(
      cardEffectHandChangedEvent(player.id, [...player.minorHand], 'minor', CARD_ID, DISCARD),
    )
    return { type: 'ok' }
  },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'seq',
      children: [
        gainLeaf(CARD_ID, { grain: 1 }),
        ...(player.resources.begging > 0
          ? [{ ...payLeaf({ cardId: CARD_ID, cost: { begging: 1 } }), optional: true }]
          : []),
      ],
    }),
  },
  listeners: [
    {
      id: CARD_ID + '-exchange-hand',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) =>
        player.minorHand.length > 0 && !playerHasCardCapability(player, 'preventsHandDiscard')
          ? {
              flow: {
                type: 'seq',
                children: [
                  { type: 'leaf', actionId: DISCARD, sourceCard: CARD_ID },
                  {
                    type: 'leaf',
                    actionId: 'draw-ordinary-cards',
                    sourceCard: CARD_ID,
                    params: { cardType: 'occupation', count: 1 },
                    actionContext: { cardType: 'occupation', count: 1 },
                  },
                ],
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL034_FranciscanMonk = defineOccupationCard({
  meta: {
    id: 'CFL034_FranciscanMonk',
    name: 'Franciscan Monk',
    deck: 'CFL',
    number: 34,
    players: '1+',
    desc: [
      'Immediately, you get 1 <GRAIN> and may return 1 <BEGGING> marker. At any time, you may discard a minor improvement from your hand to draw an occupation.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL034.png',
  },
  impl: cardImpl,
})
