import { Occupation } from '../types'
import { payLeaf } from '../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionChoiceOption, ActionFlow, PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E134_Omnifarmer'

type Storable = 'grain' | 'vegetable' | 'sheep' | 'boar' | 'cattle'

const KEY_STORED = 'storedGoods'
const KEY_USED = 'usedThisHarvest'

const readStored = (player: PlayerState): Storable[] =>
  readCardExtraData<Storable[]>(player, CARD_ID, KEY_STORED) ?? []

const readUsed = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, KEY_USED) ?? false

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

export const E134_Omnifarmer = new Occupation({
  id: CARD_ID,
  name: 'Omnifarmer',
  deck: 'E',
  number: 134,
  category: 'ACTIONS_BOOSTER',
  desc: ['Each harvest, you can place 1 harvested crop or 1 newborn animal on this card, irretrievably. Once this game, if there are 2/3/4/5 different goods on this, you get 3/5/7/9 bonus <SCORE>.'],
  cost: {},
  players: '3+',
})

export const E134_Omnifarmer_impl = {
  effect: {
    id: CARD_ID,
    onAfterReap: (_state, player) => {
      if (readUsed(player)) return
      const stored = readStored(player)
      if (stored.length >= 5) return
      const types: Storable[] = []
      if (player.resources.grain > 0 && !stored.includes('grain')) types.push('grain')
      if (player.resources.vegetable > 0 && !stored.includes('vegetable')) types.push('vegetable')
      return buildChoiceFlow(types)
    },
    onHarvestFeedingPhase: (_state, player) => {
      if (readUsed(player)) return
      const stored = readStored(player)
      if (stored.length >= 5) return
      const hasE84 = player.minorPlayed?.includes('E84_DollysMother') ?? false
      const sheepThreshold = hasE84 ? 2 : 3
      const types: Storable[] = []
      if (player.resources.sheep >= sheepThreshold && !stored.includes('sheep')) types.push('sheep')
      if (player.resources.boar >= 3 && !stored.includes('boar')) types.push('boar')
      if (player.resources.cattle >= 3 && !stored.includes('cattle')) types.push('cattle')
      return buildChoiceFlow(types)
    },
    onAfterHarvest: (_state, player) => {
      if (!readUsed(player)) return
      writeCardExtraData(player, CARD_ID, KEY_USED, false)
    },
    resolveChoice: (_state, player, choice) => {
      if (choice === 'skip') return
      const validTypes: Storable[] = ['grain', 'vegetable', 'sheep', 'boar', 'cattle']
      if (!validTypes.includes(choice as Storable)) return
      const stored = readStored(player)
      if (stored.includes(choice as Storable)) return
      writeCardExtraData(player, CARD_ID, KEY_STORED, [...stored, choice as Storable])
      writeCardExtraData(player, CARD_ID, KEY_USED, true)
      return payLeaf({ cardId: CARD_ID, cost: { [choice as Storable]: 1 } })
    },
    computeBonusScore: (_state, player) => {
      const n = readStored(player).length
      const vpMap = [0, 0, 3, 5, 7, 9]
      return vpMap[Math.min(n, 5)]!
    },
  },
  reaches: ['E84_DollysMother'] as readonly string[],
} satisfies CardImpl
