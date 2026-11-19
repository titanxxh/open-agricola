import type { GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'
import { collectCardRuleContributions } from '../card-rule-contributions'
import { getCardStack, pushToCardStack, readCardExtraData } from './card-state'
export const plowUseContribution = (cardId: string) => (player: Readonly<PlayerState>) => ({
  usedPlowActionSpaceUseId: readCardExtraData<string>(player, cardId, 'plowUse'),
})

export const classicPlowUseTaken = (state: GameState, useId: string): boolean =>
  state.players.some(player => collectCardRuleContributions(player).some(
    contribution => contribution.usedPlowActionSpaceUseId === useId,
  ))

/** Old plows spend a whole use (two extra fields), and cannot combine on one visit. */
export const classicPlow = (
  cardId: string,
  uses: number,
  extraFields = 2,
  spaces = ['farmland', 'cultivation'],
): CardImpl => ({
  effect: {
    id: cardId,
    getRuleContributions: plowUseContribution(cardId),
    onBuy: (_state, player) => {
      pushToCardStack(player, cardId, Array(uses * extraFields).fill('field'))
    },
  },
  listeners: [
    {
      id: cardId + '-plow',
      cardIds: [cardId],
      actionSpaces: spaces,
      phases: ['before'],
      handler: (context) => {
        const useId = context.actionSpaceUse?.useId
        if (!useId || getCardStack(context.player, cardId).length < extraFields) return
        if (classicPlowUseTaken(context.state, useId)) return
        return {
          sourceCard: cardId,
          flow: {
            type: 'seq',
            optional: true,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: cardId,
                params: {
                  kind: 'set-extra-data',
                  key: 'plowUse',
                  value: useId,
                },
              },
              ...Array.from({ length: extraFields }, () => ({
                type: 'leaf' as const,
                actionId: 'pop-card-stack',
                sourceCard: cardId,
              })),
              ...Array.from({ length: extraFields }, (_, i) => ({
                type: 'leaf' as const,
                actionId: 'plow',
                sourceCard: cardId,
                optional: i > 0,
              })),
            ],
          },
        }
      },
    },
  ],
})
