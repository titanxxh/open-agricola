import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import { workersAvailable } from '../../domain/player'

export const supplyWorkerTurnFlow = (
  state: GameState,
  player: PlayerState,
  cardId: string,
  consume: ActionFlow[],
  workerId?: string,
): ActionFlow => {
  const use: ActionFlow = {
    type: 'seq',
    choiceLabelKey: 'ui.interactionUseAbility',
    children: [
      ...consume,
      {
        type: 'leaf',
        actionId: 'place-farmer',
        sourceCard: cardId,
        actionContext: {
          trueAction: false,
          workerSource: { kind: 'supply', disposition: 'return-to-supply', ...(workerId ? { workerId } : {}) },
        },
      },
    ],
  }
  if (workersAvailable(state, player) > 0) return use
  return {
    type: 'xor',
    sourceCard: cardId,
    children: [
      use,
      {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: cardId,
        choiceLabelKey: 'ui.interactionDecline',
        params: { kind: 'set-flag', flag: true },
      },
    ],
  }
}

export const consumeSupplyWorkerTurn = (cardId: string): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: cardId,
  params: { kind: 'set-flag', flag: true },
})
