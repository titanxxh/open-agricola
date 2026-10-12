import type { ActionDefinition, PlayerState, Resource } from '../../contract/types'
import { REAL_RESOURCE_KEYS } from '../../contract/resource-keys'
import { readCardExtraData } from '../../cards/helpers/card-state'
import { previewCardStorageOperation } from '../card-storage'
import { payLeaf } from '../../cards/helpers/pay-gain-node'

export const createCardGoodDepositAction = (id: string, cardId: string, key: string, amount: number): ActionDefinition => {
  const storedGoods = (player: PlayerState): string[] => {
    const value = readCardExtraData<unknown>(player, cardId, key)
    return Array.isArray(value) && value.every((item): item is string => typeof item === 'string') ? value : []
  }
  const resourceOf = (value: unknown): keyof Resource | undefined => REAL_RESOURCE_KEYS.find(resource => resource === value)
  return {
    id, nameKey: `cards.${cardId}.name`, descriptionKey: `cards.${cardId}.name`, roundAvailable: 1, gainPerRound: {}, canBeExecutedByPlayer: () => true,
    previewEffect: ({ state, player, params }) => {
      const resource = resourceOf(params?.resource)
      if (!resource) return
      const score = previewCardStorageOperation(state, player, cardId, { kind: 'set-extra-data', key, value: [...storedGoods(player), resource] })
      return { kind: 'rule', description: { kind: 'group', operator: 'sequence', separator: ', ', parts: [
        { kind: 'action', showLabel: false, labelKey: 'actions.pay.name', effectPreview: { kind: 'payment', resourcesPaid: { [resource]: amount } } },
        ...(score ? [{ kind: 'action' as const, showLabel: false, labelKey: `cards.${cardId}.name`, effectPreview: score }] : []),
      ] } }
    },
    execute: ({ player, params }) => {
      const resource = resourceOf(params?.resource)
      if (!resource || (player.resources[resource] ?? 0) < amount || storedGoods(player).includes(resource)) return { type: 'fail', errorKey: 'log.actionFail' }
      return { type: 'flow', flow: { type: 'seq', children: [
        payLeaf({ cardId, cost: { [resource]: amount } }),
        { type: 'leaf', actionId: 'special-effect', sourceCard: cardId, params: { kind: 'set-extra-data', key, value: [...storedGoods(player), resource] } },
      ] } }
    },
  }
}
