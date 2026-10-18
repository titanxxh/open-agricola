import type { ActionDefinition, FarmTilePosition } from '../../../contract/types'
import { claimFarmyardGoodsTokens } from '../../../domain/farmyard-space-token-claims'
import { receiveFromCardLeaf } from '../receive'

const isPositionList = (value: unknown): value is FarmTilePosition[] =>
  Array.isArray(value) && value.every(position =>
    position && Number.isInteger(position.row) && Number.isInteger(position.col))

/** Removes the source card's claimable Farmyard goods tokens and credits their goods through `receive`. */
export const claimFarmyardGoodsTokensAction: ActionDefinition = {
  id: 'claim-farmyard-goods-tokens',
  nameKey: 'actions.claim-farmyard-goods-tokens.name',
  descriptionKey: 'actions.claim-farmyard-goods-tokens.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    const positions = params?.positions
    if (!sourceCard || (positions !== undefined && !isPositionList(positions))) {
      return { type: 'fail', errorKey: 'log.specialEffectFail' }
    }
    const gained = claimFarmyardGoodsTokens(player, sourceCard, positions)
    return Object.keys(gained).length > 0
      ? { type: 'flow', flow: receiveFromCardLeaf(sourceCard, gained) }
      : { type: 'ok' }
  },
}
