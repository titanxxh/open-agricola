import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import { payLeaf, gainLeaf } from '../helpers/pay-gain-node'
import type { CardImpl } from '../registry'
import { C70_LettucePatch } from '../../cards-display/C/C70_LettucePatch'

const CARD_ID = C70_LettucePatch.id

type CardCrop = { crop: 'vegetable'; remaining: number }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

const VIRTUAL_TILE = { row: -1, col: 70 }

const isDoableListener: CardListenerRegistration = {
  id: 'C70-lettuce-patch-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // If already doable via normal fields, no need to intervene
    if (canSow(context.player)) return
    // Check if card field is empty and player has vegetable
    const cardCrop = getCardCrop(context.player)
    if (cardCrop) return // Already has crop, can't sow
    if (context.player.resources.vegetable <= 0) return
    return { doable: true }
  },
}

export const C70_LettucePatch_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  // Provide extra sowable field when card has no crop
  onComputeSowableFields: (player): ExtraSowableField[] => {
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
  onHarvestFieldPhase: (state, player) => {
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return

    // Harvest 1 vegetable
    player.resources.vegetable += 1
    dispatchReapListener(state, player, 'vegetable', 1)
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
},
  reaches: [] as readonly string[],
} satisfies CardImpl
