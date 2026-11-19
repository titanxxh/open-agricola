import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import {
  readTurnScopeToken,
  readTurnOrGapToken,
  isUsedThisTurnOrGap,
} from '../../helpers/turn-token'
import { playerHasCardCapability } from '../../helpers/card-type'

const CARD_ID = 'CWM112_VillageSchool'

const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-payment',
      cardIds: [CARD_ID],
      actions: [
        'pay',
        'construct',
        'renovate-house',
        'improvement',
        'occupation',
        'stables',
        'fence',
      ],
      phases: ['computeCosts'],
      monotoneFenceCost: true,
      handler: (context) => {
        const player = context.player
        const token = readTurnOrGapToken(player)
        const previewNextTurn =
          readTurnScopeToken(player) === undefined &&
          context.turnScopeProjection?.playerId === player.id
        if (
          isUsedThisTurnOrGap(player, CARD_ID, context.turnScopeProjection) ||
          playerHasCardCapability(player, 'preventsHandDiscard')
        )
          return
        const hand = [...player.occupationHand, ...player.minorHand].filter(
          (id) =>
            id !== '__test_placeholder__' && id !== context.cardId && id !== context.sourceCard,
        )
        return {
          sourceCard: CARD_ID,
          paymentResourceProviders: hand.map((cardId, index) => ({
            key: `${CARD_ID}:hand${index}`,
            sourceCard: CARD_ID,
            available: 1,
            covers: (['wood', 'clay', 'reed', 'stone'] as const).map((resource) => ({
              resource,
              costAmount: 1,
              paymentAmount: 1,
            })),
            consume: {
              type: 'handCard',
              playerId: player.id,
              cardId,
              usageSource: CARD_ID,
              turnToken: token,
              ...(previewNextTurn ? { previewNextTurn: true as const } : {}),
            },
          })),
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM112_VillageSchool = defineMinorCard({
  meta: {
    id: 'CWM112_VillageSchool',
    name: "Village School",
    deck: 'CWM',
    number: 112,
    desc: ["Once per turn, whenever paying a cost, you may discard a card from your hand instead of paying 1 building resource."],
    cost: {
      wood: 2,
    },
    vp: 0,
    prerequisite: "1 occupation",
    occupationPrerequisites: {
      min: 1,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM112.png',
  },
  impl: cardImpl,
})

export const CWM112_VillageSchool_impl = CWM112_VillageSchool.impl
