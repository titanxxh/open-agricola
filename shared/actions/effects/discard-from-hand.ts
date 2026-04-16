import type { ActionChoiceOption, ActionDefinition } from '../../game/types'

/**
 * Generic "discard 1 card from hand" helper.
 *
 * Added for B146 Illusionist. The BGA server-side card takes a
 * `selectCard` SPECIAL_EFFECT with `cards` = player's hand (both occupation
 * and minor). Our engine expresses the same thing via an ActionDefinition
 * whose `execute` returns a `choice` listing the player's full hand and
 * whose `resolveChoice` removes the chosen card from whichever hand it was
 * in (occupationHand or minorHand).
 *
 * Kept narrow: no resource spend, no played-card bookkeeping. Wrap inside a
 * SEQ with a gain / other leaf when a card effect needs it.
 */

export const discardFromHandAction: ActionDefinition = {
  id: 'discard-from-hand',
  nameKey: 'actions.discard-from-hand.name',
  descriptionKey: 'actions.discard-from-hand.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const options: ActionChoiceOption[] = [
      ...player.occupationHand.map((id) => ({
        value: `occ:${id}`,
        labelKey: `occupations.${id}.name`,
      })),
      ...player.minorHand.map((id) => ({
        value: `min:${id}`,
        labelKey: `minors.${id}.name`,
      })),
    ]

    if (options.length === 0) return { type: 'fail', logKey: 'log.actionFail' }

    return {
      type: 'choice',
      promptKey: 'ui.interactionDiscardFromHand',
      options,
    }
  },
  resolveChoice: ({ player }, choice) => {
    // choice shape: "occ:{cardId}" or "min:{cardId}"
    if (choice.startsWith('occ:')) {
      const cardId = choice.slice(4)
      if (!player.occupationHand.includes(cardId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      player.occupationHand = player.occupationHand.filter((id) => id !== cardId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }
    if (choice.startsWith('min:')) {
      const cardId = choice.slice(4)
      if (!player.minorHand.includes(cardId)) {
        return { type: 'fail', logKey: 'log.actionFail' }
      }
      player.minorHand = player.minorHand.filter((id) => id !== cardId)
      return { type: 'ok', logKey: 'log.cardEffectTrigger' }
    }
    return { type: 'fail', logKey: 'log.actionFail' }
  },
}
