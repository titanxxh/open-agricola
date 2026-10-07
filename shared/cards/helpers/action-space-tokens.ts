import type { ActionHookResult } from '../../actions/hooks'
import type { ActionChoiceOption, ActionFlow, InteractionRequest, PlayerState } from '../../contract/types'
import {
  getReservedActionSpaces,
  RESERVED_ACTION_SPACES_KEY,
  setReservedActionSpaces,
} from './card-state'

type ActionSpaceTokenChoiceConfig = {
  cardId: string
  spaces: readonly string[]
  max: number
  choicePrefix: string
  promptKey?: string
}

export const actionSpaceTokenChoiceOptions = (
  config: ActionSpaceTokenChoiceConfig,
): ActionChoiceOption[] => config.max <= 0 ? [{
    value: config.choicePrefix,
    labelKey: 'ui.interactionOptionalSkip',
    sourceCard: config.cardId,
  }] : config.spaces.map((spaceId) => ({
    value: spaceId,
    labelKey: `actions.${spaceId}.name`,
    sourceCard: config.cardId,
  }))

export const actionSpaceTokenChoiceRequest = (
  config: ActionSpaceTokenChoiceConfig,
): Extract<InteractionRequest, { kind: 'choice' }> => ({
  kind: 'choice',
  options: actionSpaceTokenChoiceOptions(config),
  multiSelect: config.max > 0 ? {
    valuePrefix: config.choicePrefix,
    minSelections: 0,
    maxSelections: Math.min(config.spaces.length, config.max),
  } : undefined,
  requiresExplicitChoice: config.max > 0,
})

export const actionSpaceTokenChoiceFlow = (
  config: ActionSpaceTokenChoiceConfig,
): ActionFlow | undefined => {
  if (config.max <= 0) return
  return {
    type: 'leaf',
    actionId: 'emit-choice',
    sourceCard: config.cardId,
    params: {
      ...actionSpaceTokenChoiceRequest(config),
      ...(config.promptKey ? { promptKey: config.promptKey } : {}),
    },
  }
}

const parseActionSpaceTokenChoice = (
  choice: string,
  config: ActionSpaceTokenChoiceConfig,
): string[] => {
  if (!choice.startsWith(config.choicePrefix)) return []
  const selected = choice.slice(config.choicePrefix.length).split(',').filter(Boolean)
  const unique = [...new Set(selected)]
  if (unique.length !== selected.length) return []
  if (unique.length > config.max) return []
  return unique.every((spaceId) => config.spaces.includes(spaceId)) ? unique : []
}

export const resolveActionSpaceTokenChoice = (
  player: PlayerState,
  choice: string,
  config: ActionSpaceTokenChoiceConfig,
): boolean => {
  const spaces = parseActionSpaceTokenChoice(choice, config)
  if (spaces.length === 0) return false
  setReservedActionSpaces(player, config.cardId, spaces)
  return true
}

export const ownerSpecialEffect = (
  cardId: string,
  ownerPlayerId: string,
  params: Record<string, unknown>,
): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: cardId,
  actionContext: { targetPlayerId: ownerPlayerId },
  params,
})

export const consumeActionSpaceToken = ({
  cardId,
  owner,
  ownerPlayerId,
  spaceId,
  reward,
}: {
  cardId: string
  owner: PlayerState
  ownerPlayerId: string
  spaceId: string
  reward?: ActionFlow | undefined
}): ActionHookResult | undefined => {
  const spaces = getReservedActionSpaces(owner, cardId)
  if (!spaces.includes(spaceId)) return

  const children: ActionFlow[] = [
    ownerSpecialEffect(cardId, ownerPlayerId, {
      kind: 'set-extra-data',
      key: RESERVED_ACTION_SPACES_KEY,
      value: spaces.filter((s) => s !== spaceId),
    }),
  ]
  if (reward) children.push(reward)

  return {
    flow: children.length === 1 ? children[0] : { type: 'seq', children },
    ...(reward ? {} : { countCardUse: false }),
    sourceCard: cardId,
  }
}
