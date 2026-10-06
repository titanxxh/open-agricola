import { defineOccupationCard } from '../card-source'
import type {
  ActionDefinition,
  PlayerState,
  Resource,
} from '../../contract/types'
import { countUnusedFarmyardSpaces } from '../../domain/farmyard-usage'
import { registerAdHocAction } from '../../actions/helpers/ad-hoc-action-registry'
import type { CardImpl } from '../registry'
import { readCardExtraData } from '../helpers/card-state'

const CARD_ID = 'D132_HideFarmer'
const MARK_SPACES_ACTION_ID = `card_${CARD_ID}_markSpaces`

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const setHiddenSpaces = (player: PlayerState, n: number) => {
  const cardState = player.cardStates[CARD_ID] ?? {}
  player.cardStates[CARD_ID] = cardState
  cardState.extraData = { ...(cardState.extraData ?? {}), hiddenSpaces: n }
}

const readResourceCounts = (
  payload: unknown,
): Partial<Record<keyof Resource, number>> => {
  if (!isRecord(payload)) return {}
  const raw = isRecord(payload.resourceCounts) ? payload.resourceCounts : payload
  const counts: Partial<Record<keyof Resource, number>> = {}
  Object.entries(raw).forEach(([key, value]) => {
    if (typeof value === 'number') counts[key as keyof Resource] = value
  })
  return counts
}

const markSpacesAction: ActionDefinition = {
  id: MARK_SPACES_ACTION_ID,
  nameKey: 'cards.D132_HideFarmer.markSpaces.name',
  descriptionKey: 'cards.D132_HideFarmer.markSpaces.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const food = player.resources.food ?? 0
    const empty = countUnusedFarmyardSpaces(player)
    const max = Math.min(food, empty)
    if (max <= 0) {
      setHiddenSpaces(player, 0)
      return { type: 'ok' }
    }
    return {
      type: 'request',
      request: {
        kind: 'resource-quantity-select',
        anytimeWindow: { allowed: false },
        cardId: CARD_ID,
        availableByResource: { food: max },
        promptKey: 'ui.cards.D132_HideFarmer.markSpaces.prompt',
        requireAtLeastOne: false,
      },
    }
  },
  resolveChoice: ({ player }, _choice, payload) => {
    const counts = readResourceCounts(payload)
    const hasNonFood = Object.entries(counts).some(
      ([key, value]) => key !== 'food' && (value ?? 0) !== 0,
    )
    const n = counts.food ?? 0
    const food = player.resources.food ?? 0
    const empty = countUnusedFarmyardSpaces(player)
    const max = Math.min(food, empty)
    if (hasNonFood || !Number.isInteger(n) || n < 0 || n > max) {
      return {
        type: 'fail',
        errorKey: 'cards.D132_HideFarmer.markSpaces.invalid',
        recoverable: true,
      }
    }
    player.resources.food = food - n
    setHiddenSpaces(player, n)
    return { type: 'ok', resourcesPaid: n > 0 ? { food: n } : {} }
  },
}

registerAdHocAction(markSpacesAction)

const cardImpl = {
  effect: {
    id: CARD_ID,
    getRuleContributions: (player) => ({ unusedSpaceReduction: readCardExtraData<number>(player, CARD_ID, 'hiddenSpaces') ?? 0 }),
    onBeforeEndGame: (_state, player) => {
      if (
        typeof player.cardStates?.[CARD_ID]?.extraData?.hiddenSpaces ===
        'number'
      ) {
        return
      }
      const empty = countUnusedFarmyardSpaces(player)
      if (empty === 0) return
      return {
        type: 'leaf',
        actionId: MARK_SPACES_ACTION_ID,
        sourceCard: CARD_ID,
        optional: true,
        anytimeWindow: { allowed: true },
        promptKey: 'ui.cards.D132_HideFarmer.optional',
      }
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const D132_HideFarmer = defineOccupationCard({
  meta: {
    id: CARD_ID,
    name: "Hide Farmer",
    deck: "D",
    number: 132,
    category: "POINTS_PROVIDER",
    desc: ['During scoring, you can pay 1 <FOOD> each for any number of unused farmyard spaces. You do not lose points for these spaces.'],
    cost: {},
    players: "3+",
  },
  impl: cardImpl,
})

export const D132_HideFarmer_impl = D132_HideFarmer.impl
