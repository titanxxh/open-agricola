import { MinorImprovement } from '../types'
import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import type { CardImpl } from '../registry'

const CARD_ID = 'E72_ArtichokeField'

type CardCrop = { crop: 'grain' | 'vegetable'; remaining: number }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

/** Virtual tile position — unique per card, not a real farm tile. */
const VIRTUAL_TILE: FarmTilePosition = { row: -1, col: 72 }

const tileMatches = (tile: FarmTilePosition) =>
  tile.row === VIRTUAL_TILE.row && tile.col === VIRTUAL_TILE.col

// --- isDoable listener: make sow doable when card field is available + player has seeds ---

const isDoableListener: CardListenerRegistration = {
  id: 'E72-artichoke-field-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // If already doable via normal fields, no need to intervene
    if (canSow(context.player)) return
    // Check if card field is empty AND player has seeds
    const cardCrop = getCardCrop(context.player)
    if (cardCrop) return // card field occupied
    const hasSeeds =
      context.player.resources.grain > 0 || context.player.resources.vegetable > 0
    if (!hasSeeds) return
    return { doable: true }
  },
}

export const E72_ArtichokeField = new MinorImprovement({
  id: CARD_ID,
  name: 'Artichoke Field',
  deck: 'E',
  number: 72,
  category: 'CROPS_-_GRAIN_AND_VEGETABLE',
  desc: [
    'This card is a field. During the field phase of each harvest, if you harvest at least 1\u00a0good from this card, you also get 1 <FOOD>.',
  ],
  cost: { wood: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  isField: true,
})

export const E72_ArtichokeField_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  onComputeSowableFields: (player): ExtraSowableField[] => {
    const cardCrop = getCardCrop(player)
    if (cardCrop) return [] // already has a crop
    return [
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['grain', 'vegetable'],
        sourceCard: CARD_ID,
      },
    ]
  },

  onSowExtraField: (player, tile, crop): boolean => {
    if (!tileMatches(tile)) return false
    if (crop !== 'grain' && crop !== 'vegetable') return false
    const cardCrop = getCardCrop(player)
    if (cardCrop) return false // already sown
    if (player.resources[crop] <= 0) return false
    player.resources[crop] -= 1
    const remaining = crop === 'grain' ? 3 : 2
    setCardCrop(player, { crop, remaining })
    return true
  },

  onHarvestFieldPhase: (state, player) => {
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return
    // Harvest 1 unit of the crop
    player.resources[cardCrop.crop] += 1
    dispatchReapListener(state, player, cardCrop.crop, 1)
    cardCrop.remaining -= 1
    // Bonus: gain 1 food whenever we harvest at least 1 good
    player.resources.food += 1
    if (cardCrop.remaining <= 0) {
      setCardCrop(player, null)
    } else {
      setCardCrop(player, cardCrop)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
