import { getPlowableTiles } from '../../../actions/effects/plow'
import type { FarmTilePosition, PlayerState } from '../../../contract/types'
import { getFarmyardTilePositions, getUsedFarmyardTileKeys, positionKey } from '../../../domain/farm'
import { collectLockedFarmTileKeys } from '../../card-effects'
import { defineMinorCard } from '../../card-source'
import { getFarmyardFields } from '../../helpers/card-field'
import { isCardFlagged } from '../../helpers/card-state'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM091_IronPlow'

const isOrthogonallyAdjacent = (a: FarmTilePosition, b: FarmTilePosition): boolean =>
  Math.abs(a.row - b.row) + Math.abs(a.col - b.col) === 1

const canPlowTwoFields = (player: PlayerState): boolean => {
  const firstTiles = getPlowableTiles(player)
  if (firstTiles.length === 0) return false
  const used = getUsedFarmyardTileKeys(player)
  const locked = collectLockedFarmTileKeys(player)
  const existingFields = getFarmyardFields(player)
  const unusedUnlocked = getFarmyardTilePositions(player).filter((tile) => {
    const key = positionKey(tile)
    return !used.has(key) && !locked.has(key)
  })
  return firstTiles.some((first) => {
    const firstKey = positionKey(first)
    return unusedUnlocked.some(
      (second) =>
        positionKey(second) !== firstKey
        && (isOrthogonallyAdjacent(first, second)
          || existingFields.some((field) => isOrthogonallyAdjacent(field, second))),
    )
  })
}

const isFarmlandSpaceBodyPlow = (actionContext: Record<string, unknown> | undefined): boolean => {
  if (actionContext?.checkedReplaceAction === true) return false
  const origin = actionContext?.sourceLocation as { kind?: unknown; spaceId?: unknown } | undefined
  return origin?.kind === 'actionSpace' && origin.spaceId === 'farmland'
}

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-replace-plow`,
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['computeReplace'],
      handler: (context) => {
        if (!isFarmlandSpaceBodyPlow(context.actionContext)) return
        if (isCardFlagged(context.player, CARD_ID)) return
        if (!canPlowTwoFields(context.player)) return
        return {
          decline: true,
          sourceCard: CARD_ID,
          alternativeFlow: {
            type: 'seq',
            choiceLabelKey: `cards.${CARD_ID}.name`,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-flag', flag: true },
              },
              { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID },
              { type: 'leaf', actionId: 'sow', sourceCard: CARD_ID, optional: true },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM091_IronPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Iron Plow',
    deck: 'CWM',
    number: 91,
    cost: { stone: 1, wood: 1 },
    vp: 0,
    desc: [
      'Once during the game, when you use the __space:farmland|Farmland__ action space, you may plow 2 <FIELD> instead of 1 and take a __Sow__ action afterward.',
    ],
    artUrl: 'assets/classic/CWM/CWM091.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM091_IronPlow_impl = CWM091_IronPlow.impl
