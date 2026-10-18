import type { ActionDefinition } from '../../../contract/types'
import { claimFieldGoodsTokens } from '../../../domain/farmyard-space-token-claims'
import { receiveFromCardLeaf } from '../receive'

/** Removes the source card's claimable field goods tokens and credits their goods through `receive`. */
export const claimFieldGoodsTokensAction: ActionDefinition = {
  id: 'claim-field-goods-tokens',
  nameKey: 'actions.claim-field-goods-tokens.name',
  descriptionKey: 'actions.claim-field-goods-tokens.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player, params, sourceCard }) => {
    if (!sourceCard) return { type: 'fail', errorKey: 'log.specialEffectFail' }
    const positions = Array.isArray(params?.positions)
      ? params.positions.filter((pos): pos is { row: number; col: number } =>
          Number.isFinite(pos?.row) && Number.isFinite(pos?.col))
      : undefined
    const gained = claimFieldGoodsTokens(player, sourceCard, positions)
    return Object.keys(gained).length > 0
      ? { type: 'flow', flow: receiveFromCardLeaf(sourceCard, gained) }
      : { type: 'ok' }
  },
}
