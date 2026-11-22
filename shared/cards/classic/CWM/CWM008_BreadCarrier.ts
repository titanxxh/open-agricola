import type { GameState, PlayerState, ActionFlow } from '../../../contract/types'
import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { createEventQuery } from '../../../events/query'
import { getCardDefinitionById } from '../../helpers/card-type'

const CARD_ID = 'CWM008_BreadCarrier'

const schedule = (state: GameState, owner: PlayerState): ActionFlow => {
  return {
    type: 'seq',
    targetPlayerId: owner.id,
    children: [
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-extra-data', key: 'scheduled', value: true },
      },
      {
        ...futureMeeplesNode({
          cardId: CARD_ID,
          playerId: owner.id,
          entries: Array.from({ length: 14 - state.round }, (_, i) => ({
            round: state.round + i + 1,
            resources: { food: 1 },
          })),
        }),
        sourceCard: CARD_ID,
      },
    ],
  }
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) =>
      state.players.some((p) =>
        [...p.improvements, ...p.minorPlayed].some((id) => getCardDefinitionById(id)?.ovenIdentity),
      )
        ? schedule(state, player)
        : undefined,
  },
  listeners: [
    {
      id: CARD_ID + '-oven',
      cardIds: [CARD_ID],
      actions: ['improvement'],
      phases: ['after'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        if (readCardExtraData(owner, CARD_ID, 'scheduled')) return
        if (
          !createEventQuery(context.actionEvents ?? [])
            .filter('card.played')
            .some((e) => getCardDefinitionById(e.cardId)?.ovenIdentity)
        )
          return
        return { sourceCard: CARD_ID, flow: schedule(context.state, owner) }
      },
    },
  ],
} satisfies CardImpl

export const CWM008_BreadCarrier = defineOccupationCard({
  meta: {
    id: 'CWM008_BreadCarrier',
    name: "Bread Carrier",
    deck: 'CWM',
    number: 8,
    desc: ["Once only, when any player builds an oven, place 1 <FOOD> on each remaining round space. At the start of those rounds, you get the <FOOD>."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM008.png',
  },
  impl: cardImpl,
})

export const CWM008_BreadCarrier_impl = CWM008_BreadCarrier.impl
