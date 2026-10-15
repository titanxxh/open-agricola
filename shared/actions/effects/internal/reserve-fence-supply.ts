import type { ActionDefinition } from '../../../contract/types'

export const reserveFenceSupplyAction: ActionDefinition = {
  id: 'reserve-fence-supply',
  nameKey: 'actions.reserve-fence-supply.name',
  descriptionKey: 'actions.reserve-fence-supply.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  previewEffect: ({ params }) => typeof params?.selectedCount === 'number'
    ? { kind: 'fenceReserve', amount: params.selectedCount } : undefined,
  execute: ({ player, params, sourceCard }) => {
    if (!sourceCard || typeof params?.counterKey !== 'string' ||
      typeof params.selectedCount !== 'number' || !Number.isSafeInteger(params.selectedCount) || params.selectedCount <= 0 ||
      (player.cardStates[sourceCard]?.counters?.[params.counterKey] ?? 0) < params.selectedCount) {
      return { type: 'fail', errorKey: 'log.actionFail' }
    }
    return { type: 'ok', beforeHostContributions: [{
      key: 'fenceSupplyReservations', sourceCard,
      value: { counterKey: params.counterKey, selectedCount: params.selectedCount },
    }] }
  },
}
