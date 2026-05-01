import { Occupation } from '../types'
import { readCardExtraData } from '../helpers/card-state'
import type { ActionChoiceOption, ActionFlow, PlayerState } from '../../game/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'E149_MidnightFencer'

const KEY_OWED = 'owedFences'
const KEY_OFFERED = 'offered'

const readOwed = (player: PlayerState): number =>
  readCardExtraData<number>(player, CARD_ID, KEY_OWED) ?? 0

const readOffered = (player: PlayerState): boolean =>
  readCardExtraData<boolean>(player, CARD_ID, KEY_OFFERED) ?? false

const buildOfferChoice = (max: number): ActionFlow => {
  const options: ActionChoiceOption[] = [
    { value: '0', labelKey: 'ui.interactionE149Skip', sourceCard: CARD_ID },
    ...Array.from({ length: max }, (_, i) => ({
      value: String(i + 1),
      labelKey: `ui.interactionE149Take${i + 1}`,
      sourceCard: CARD_ID,
    })),
  ]
  return {
    type: 'leaf',
    actionId: 'emit-choice',
    sourceCard: CARD_ID,
    params: {
      promptKey: 'ui.interactionE149Prompt',
      options,
    },
  }
}

export const E149_MidnightFencer = new Occupation({
  id: CARD_ID,
  name: 'Midnight Fencer',
  deck: 'E',
  number: 149,
  desc: ["At the start of the last harvest, you can take up to 2 of each other player's unbuilt fences and build them on your farm at no cost. (Your farm can then have over 15 fences.)"],
  cost: {},
  players: '4+',
})

export const E149_MidnightFencer_impl = {
  effect: {
    id: CARD_ID,
    onStartHarvest: (state, player) => {
      if (state.round !== 14) return
      if (readOffered(player)) return
      const numOpponents = state.players.length - 1
      if (numOpponents <= 0) return
      const max = 2 * numOpponents
      return {
        type: 'seq',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-extra-data', key: KEY_OFFERED, value: true },
          },
          buildOfferChoice(max),
        ],
      }
    },
    resolveChoice: (_state, _player, choice) => {
      const k = parseInt(choice, 10)
      if (Number.isNaN(k) || k <= 0) return
      return {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'increment-extra-data', key: KEY_OWED, amount: k },
      }
    },
    computeBonusScore: (_state, player) => readOwed(player),
  },
  reaches: [] as readonly string[],
} satisfies CardImpl
