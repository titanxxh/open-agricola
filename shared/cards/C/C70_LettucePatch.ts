import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ExtraSowableField } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState } from '../../game/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'

const CARD_ID = 'C70_LettucePatch'

type CardCrop = { crop: 'vegetable'; remaining: number }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) => {
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)
  // Mirror remaining into counters so the UI can render the crop stack
  // via PlayedCardStats's existing resource-chip path.
  const state = player.cardStates?.[CARD_ID]
  if (!state) return
  if (!state.counters) state.counters = {}
  delete state.counters.vegetable
  if (crop && crop.remaining > 0) {
    state.counters[crop.crop] = crop.remaining
  }
}

// Virtual tile for this card's extra field
const VIRTUAL_TILE = { row: -1, col: 70 }

// --- Card Effect ---

registerCardEffect({
  id: CARD_ID,

  // Provide extra sowable field when card has no crop
  onComputeSowableFields: (player): ExtraSowableField[] => {
    if (!player.minorPlayed.includes(CARD_ID)) return []
    const cardCrop = getCardCrop(player)
    if (cardCrop) return [] // Already has a crop
    return [
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['vegetable'],
        sourceCard: CARD_ID,
      },
    ]
  },

  // Handle sowing into the card's virtual field
  onSowExtraField: (player, tile, crop): boolean => {
    if (!player.minorPlayed.includes(CARD_ID)) return false
    if (tile.row !== VIRTUAL_TILE.row || tile.col !== VIRTUAL_TILE.col) return false
    if (crop !== 'vegetable') return false

    // Check not already sown
    const existing = getCardCrop(player)
    if (existing) return false

    // Deduct resource
    if (player.resources.vegetable <= 0) return false
    player.resources.vegetable -= 1

    // Store sown crop (vegetable starts with 2 remaining)
    setCardCrop(player, { crop: 'vegetable', remaining: 2 })
    return true
  },

  // Harvest from card field during field phase
  onHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return

    // Harvest 1 vegetable
    player.resources.vegetable += 1
    cardCrop.remaining -= 1
    if (cardCrop.remaining <= 0) {
      setCardCrop(player, null)
    } else {
      setCardCrop(player, cardCrop)
    }

    // Offer optional conversion: 1 veg → 4 food
    return {
      type: 'seq' as const,
      optional: true,
      children: [
        payLeaf({ cardId: CARD_ID, cost: { vegetable: 1 } }),
        gainLeaf(CARD_ID, { food: 4 }),
      ],
    }
  },
})

// --- isDoable listener: make sow doable when card field can be sown ---

const isDoableListener: CardListenerRegistration = {
  id: 'C70-lettuce-patch-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    // If already doable via normal fields, no need to intervene
    if (canSow(context.player)) return
    // Check if card field is empty and player has vegetable
    const cardCrop = getCardCrop(context.player)
    if (cardCrop) return // Already has crop, can't sow
    if (context.player.resources.vegetable <= 0) return
    return { doable: true }
  },
}

registerCardListener(isDoableListener)

export const C70_LettucePatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Lettuce Patch',
  deck: 'C',
  number: 70,
  category: 'CROP_PROVIDER',
  providesField: true,
  vp: 1,
  cost: {},
  prerequisite: '3 Occupations',
  occupationPrerequisites: { min: 3 },
  desc: [
    'This card is a field that can only grow vegetables. You can immediately turn each <VEGETABLE> you harvested from this card into 4 <FOOD>.',
  ],
})
