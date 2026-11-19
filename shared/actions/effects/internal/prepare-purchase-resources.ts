import type { ActionDefinition } from '../../../contract/types'
import { purchaseResourceGrantAlternatives } from '../../../cards/helpers/purchase-resource-grants'
import { gainLeaf } from '../../../cards/helpers/pay-gain-node'
import { payAction } from '../pay'

/** The persisted host cursor ensures these grants execute once, even after reload. */
export const preparePurchaseResourcesAction: ActionDefinition = {
  id: 'prepare-purchase-resources',
  nameKey: 'actions.gain.name',
  descriptionKey: 'actions.gain.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: (context) => {
    const { state, player, params } = context
    if (typeof params?.cardId !== 'string' || (params.kind !== 'minor' && params.kind !== 'major'))
      return { type: 'fail', errorKey: 'log.improvementFail' }
    if (!params.payment || typeof params.payment !== 'object')
      return { type: 'fail', errorKey: 'log.improvementFail' }
    const alternatives = purchaseResourceGrantAlternatives(
      state,
      player,
      params.cardId,
      params.kind,
    ).filter((alternative) =>
      payAction.costPreview?.canExecute?.({
        ...context,
        player: alternative.player,
        state: {
          ...state,
          players: state.players.map((owner) =>
            owner.id === player.id ? alternative.player : owner,
          ),
        },
        params: params.payment as Record<string, unknown>,
      }),
    )
    return alternatives.length
      ? {
          type: 'flow',
          flow: {
            type: 'xor',
            children: alternatives.map((alternative) => ({
              type: 'seq',
              children: alternative.grants.map((grant) =>
                gainLeaf(grant.sourceCard, grant.resources),
              ),
            })),
          },
        }
      : { type: 'fail', errorKey: 'log.improvementFail' }
  },
}
