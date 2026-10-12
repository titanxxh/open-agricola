import { defineOccupationCard } from '../card-source'
import { createCardGoodDepositAction } from '../../actions/plans/card-good-deposit'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import { readCardExtraData } from '../helpers/card-state'
import { getHarvestOutcome } from '../../actions/helpers/harvest-outcome'
import type { ActionFlow, GameState, PlayerState } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E134_Omnifarmer'
type Storable = 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle' | 'horse'

const KEY_STORED = 'storedGoods'
const DEPOSIT_AMOUNT = 1
const DEPOSIT_ACTION = 'card_E134_Omnifarmer_deposit'
registerAdHocAction(createCardGoodDepositAction(DEPOSIT_ACTION, CARD_ID, KEY_STORED, DEPOSIT_AMOUNT))
const isStorable = (value: unknown): value is Storable => value === 'grain' || value === 'vegetable' || value === 'sheep' || value === 'boar' || value === 'cattle' || value === 'horse'

const readStored = (player: PlayerState): Storable[] =>
  readCardExtraData<Storable[]>(player, CARD_ID, KEY_STORED) ?? []

const buildChoiceFlow = (types: Storable[]): ActionFlow | undefined => {
  if (types.length === 0) return
  return { type: 'xor', optional: true, sourceCard: CARD_ID, promptKey: 'ui.interactionE134Prompt',
    children: types.map(type => ({ type: 'leaf', actionId: DEPOSIT_ACTION, sourceCard: CARD_ID, params: { resource: type } })),
  }
}

const outcomeStorableTypes = (state: GameState, player: PlayerState): Storable[] => {
  const stored = readStored(player)
  if (stored.length >= 5) return []
  const outcome = getHarvestOutcome(state, player.id)
  const types = [
    ...outcome.harvestedCropTypes,
    ...outcome.newbornAnimalTypes,
  ].filter(isStorable)
  return types.filter((type, index) =>
    !stored.includes(type) && types.indexOf(type) === index,
  )
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    projectInteractionRequest: (state, player, request) => {
      if (request.kind !== 'choice') return request
      const eligible = outcomeStorableTypes(state, player)
      return { ...request, options: request.options.map(option => {
        const description = option.effectPreview?.kind === 'rule' ? option.effectPreview.description : option.descriptionPreview
        const parts = description?.kind === 'group' ? description.parts : []
        const payment = parts[0]?.kind === 'action' ? parts[0].effectPreview : undefined
        const resource = payment?.kind === 'payment' ? Object.keys(payment.resourcesPaid ?? {}).find(isStorable) : undefined
        if (!isStorable(resource)) return option
        const disabled = !eligible.includes(resource) || (player.resources[resource] ?? 0) < DEPOSIT_AMOUNT
        return { ...option, disabled, disabledReasonKey: disabled ? 'ui.interactionTriggerUnavailable' : undefined }
      }) }
    },
    onAfterHarvest: (state, player) => {
      return buildChoiceFlow(outcomeStorableTypes(state, player))
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
