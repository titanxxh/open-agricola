import type { ActionHookRegistry } from '../hooks'
import { emptyResources } from '../../contract/state-constants'
import type { ActionFlow, ActionSpace, GameState, PlayerState } from '../../contract/types'
import type { CardListenerContext } from '../../cards/card-listeners'
import { getMatchingListeners } from '../../cards/card-listeners'
import { createTriggerSnapshot } from '../../cards/helpers/trigger-snapshot'
import { planListenerOwnerGroups } from '../../engine/matched-trigger'
import type { ActivateCardActionParams } from '../../engine/activation-action'

export type ReapTrigger = {
  phase: string
  actionId?: string
  cardId?: string
}

export type ReapListenerOptions = {
  trigger?: ReapTrigger
  sourceCard?: string
  afterCompletion?: 'manual' | 'action'
}

type ReapCrop = 'grain' | 'vegetable' | 'wood' | 'stone'
export type ReapedCropAmounts = Partial<Record<ReapCrop, number>>
export type ReapReceipt = { reapedCropAmounts: ReapedCropAmounts; trigger: ReapTrigger; sourceCard?: string }

export const getReapedCropAmount = (context: CardListenerContext, crop: ReapCrop): number => {
  const extraData = context.result && 'extraData' in context.result ? context.result.extraData : context.extraData
  const amounts = extraData?.reapedCropAmounts
  if (!amounts || typeof amounts !== 'object') return 0
  const amount: unknown = Reflect.get(amounts, crop)
  return typeof amount === 'number' ? amount : 0
}

export const defaultReapTrigger = (): ReapTrigger => ({ phase: 'harvest' })

export const dispatchReapListeners = (
  state: GameState,
  player: PlayerState,
  amounts: ReapedCropAmounts,
  options: ReapListenerOptions = {},
  actionHooks?: ActionHookRegistry,
): ActionFlow | undefined => {
  const trigger = options.trigger ?? defaultReapTrigger()
  const triggerSnapshot = createTriggerSnapshot(state)
  const space: ActionSpace = {
    id: 'reap', nameKey: 'actions.reap.name', descriptionKey: 'actions.reap.description',
    roundAvailable: 1, gainPerRound: {}, resources: { ...emptyResources }, takenBy: [],
    canBeExecutedByPlayer: () => true, execute: () => ({ type: 'ok' }),
  }
  const children: ActionFlow[] = []
  const appendPhase = (phase: 'immediatelyAfter' | 'after', extraData: Record<string, unknown>) => {
    const context = { actionHooks, state, player, space, actionId: 'reap', phase, extraData }
    for (const { ownerPlayerId, listeners } of planListenerOwnerGroups(getMatchingListeners(context), state, player.id)) {
      const activations: ActionFlow[] = listeners.map(entry => {
        const params: ActivateCardActionParams = {
          listenerId: entry.registration.id, cardId: entry.cardId,
          phase, actionId: 'reap', event: { extraData }, triggerPlayerId: player.id,
          ownerPlayerId: entry.ownerPlayerId, ownerCardZone: entry.ownerCardZone,
          mandatory: entry.registration.mandatory === true, triggerSnapshot,
        }
        return { type: 'leaf', actionId: 'activate-card', sourceCard: entry.cardId, targetPlayerId: ownerPlayerId, params }
      })
      children.push(activations.length === 1 ? activations[0]!
        : { type: 'parallel', mode: 'trigger-select', targetPlayerId: ownerPlayerId, children: activations })
    }
  }
  for (const crop of ['grain', 'vegetable', 'wood', 'stone'] as const) {
    const amount = amounts[crop] ?? 0
    if (amount <= 0) continue
    appendPhase('immediatelyAfter', { crop, amount, trigger, ...(options.sourceCard ? { sourceCard: options.sourceCard } : {}) })
  }
  if (options.afterCompletion !== 'action' && Object.values(amounts).some(amount => amount > 0)) {
    appendPhase('after', { reapedCropAmounts: amounts, trigger, ...(options.sourceCard ? { sourceCard: options.sourceCard } : {}) } satisfies ReapReceipt)
  }
  if (children.length === 0) return
  return { type: 'seq', children }
}
