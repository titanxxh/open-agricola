import { defineMinorCard } from '../../card-source'
import { getActionNewlyUsedTiles } from '../../helpers/farmyard-events'
import { hasClaimableFarmyardGoodsTokens } from '../../../domain/farmyard-space-token-claims'
import type { CardImpl } from '../../registry'
import { getFarmyardTilePositions, positionKey } from '../../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../../domain/farmyard-usage'
import { addFarmyardSpaceState } from '../../../domain/farm-operations'
import { registerSelectionEffect } from '../../../actions/helpers/selection-effect-registry'

const CARD_ID = 'CWM103_Raspberries'

const SELECT = CARD_ID + '-food'
registerSelectionEffect(SELECT, ({ player, positions, eventSink, recordFarmOperation }) => {
  for (const key of positions)
    recordFarmOperation?.(
      addFarmyardSpaceState(
        player,
        {
          sourceCardId: CARD_ID,
          spaceKey: key,
          kind: 'farmyard-goods-token',
          resources: { food: 1 },
          claimPolicy: 'when-no-longer-unused',
          blocksPlacement: false,
        },
        eventSink,
      ),
    )
})
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-claim',
      cardIds: [CARD_ID],
      events: ['farm.spacesUsed'],
      phases: ['after'],
      handler: (context) => {
        const positions = getActionNewlyUsedTiles(context)
        return hasClaimableFarmyardGoodsTokens(context.player, CARD_ID, positions)
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'claim-farmyard-goods-tokens',
                sourceCard: CARD_ID,
                params: { positions },
              },
            }
          : undefined
      },
    },
  ],
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const used = getUsedFarmyardTileKeys(player)
      const selectableTiles = getFarmyardTilePositions(player).filter(
        (tile) => !used.has(positionKey(tile)),
      )
      return selectableTiles.length
        ? {
            type: 'leaf',
            actionId: 'selection',
            sourceCard: CARD_ID,
            optional: true,
            actionContext: {
              selectionKind: 'farm-position',
              selectionEffect: SELECT,
              minSelections: 1,
              maxSelections: 3,
              selectableTiles,
            },
          }
        : undefined
    },
  },
} satisfies CardImpl

export const CWM103_Raspberries = defineMinorCard({
  meta: {
    id: 'CWM103_Raspberries',
    name: "Raspberries",
    deck: 'CWM',
    number: 103,
    desc: ["Place 1 <FOOD> from the supply on each of up to 3 unused farmyard spaces. When a marked space becomes used, you get its <FOOD>. The <FOOD> markers do not themselves make spaces used."],
    cost: {
      clay: 1,
    },
    vp: 1,
    prerequisite: "2 occupations",
    occupationPrerequisites: {
      min: 2,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM103.png',
  },
  impl: cardImpl,
})

export const CWM103_Raspberries_impl = CWM103_Raspberries.impl
