import { defineOccupationCard } from '../card-source'
import { payLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { getHarvestOutcome } from '../../actions/helpers/harvest-outcome'
import { animalKeysForState } from '../../contract/animals'
import type { ActionChoiceOption, ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E134_Omnifarmer'
type Storable = 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle' | 'horse'

const KEY_STORED = 'storedGoods'

const readStored = (player: PlayerState): Storable[] =>
  readCardExtraData<Storable[]>(player, CARD_ID, KEY_STORED) ?? []

const buildChoiceFlow = (types: Storable[]): ActionFlow | undefined => {
  if (types.length === 0) return undefined
  const options: ActionChoiceOption[] = [
    { value: 'skip', labelKey: 'ui.interactionE134Skip', sourceCard: CARD_ID },
    ...types.map((t) => ({
      value: t,
      labelKey: `ui.interactionE134Deposit_${t}`,
      sourceCard: CARD_ID,
    })),
  ]
  return {
    type: 'leaf',
    actionId: 'emit-choice',
    sourceCard: CARD_ID,
    params: {
      promptKey: 'ui.interactionE134Prompt',
      options,
    },
  }
}

const outcomeStorableTypes = (state: GameState, player: PlayerState): Storable[] => {
  const stored = readStored(player)
  if (stored.length >= 5) return []
  const outcome = getHarvestOutcome(state, player.id)
  const types = [
    ...outcome.harvestedCropTypes,
    ...outcome.newbornAnimalTypes,
  ] as Storable[]
  return types.filter((type, index) =>
    !stored.includes(type) && types.indexOf(type) === index,
  )
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    projectInteractionRequest: (state, player, request, actionId) => {
      if (actionId !== 'emit-choice' || request.kind !== 'choice') return request
      const eligible = outcomeStorableTypes(state, player)
      return {
        ...request,
        options: request.options.map((option) => {
          if (option.value === 'skip') return option
          const disabled = !eligible.includes(option.value as Storable) || (player.resources[option.value as Storable] ?? 0) <= 0
          return { ...option, disabled, disabledReasonKey: disabled ? 'ui.interactionTriggerUnavailable' : undefined }
        }),
      }
    },
    onAfterHarvest: (state, player) => {
      return buildChoiceFlow(outcomeStorableTypes(state, player))
    },
    resolveChoice: (state, player, choice) => {
      if (choice === 'skip') return
      const validTypes: Storable[] = ['grain', 'vegetable', ...animalKeysForState(state)]
      if (!validTypes.includes(choice as Storable)) return
      const stored = readStored(player)
      if (stored.includes(choice as Storable)) return
      if (!outcomeStorableTypes(state, player).includes(choice as Storable)) return
      if ((player.resources[choice as Storable] ?? 0) <= 0) return
      writeCardExtraData(player, CARD_ID, KEY_STORED, [...stored, choice as Storable])
      return payLeaf({ cardId: CARD_ID, cost: { [choice as Storable]: 1 } })
    },
    computeBonusScore: (_state, player) => {
      const n = readStored(player).length
      const vpMap = [0, 0, 3, 5, 7, 9]
      return vpMap[Math.min(n, 5)]!
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const E134_Omnifarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: 'Omnifarmer',
    deck: 'E',
    number: 134,
    category: 'BONUS_POINTS',
    desc: ['Each harvest, you can place 1 harvested crop or 1 newborn animal on this card, irretrievably. Once this game, if there are 2/3/4/5 different goods on this, you get 3/5/7/9 bonus <SCORE>.'],
    cost: {},
    players: '3+',
    extraVp: true,
  },
  impl: cardImpl,
})

export const E134_Omnifarmer_impl = E134_Omnifarmer.impl
