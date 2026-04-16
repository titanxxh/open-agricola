import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import type { ExtraSowableField } from '../card-effects'
import { registerCardListener } from '../card-listeners'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../game/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'

const CARD_ID = 'E69_MelonPatch'

type CardCrop = { crop: 'grain' | 'vegetable'; remaining: number }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

/** Virtual tile position — unique per card, not a real farm tile. */
const VIRTUAL_TILE: FarmTilePosition = { row: -1, col: 69 }

const tileMatches = (tile: FarmTilePosition) =>
  tile.row === VIRTUAL_TILE.row && tile.col === VIRTUAL_TILE.col

// --- Card Effect ---

registerCardEffect({
  id: CARD_ID,

  onComputeSowableFields: (player): ExtraSowableField[] => {
    if (!player.minorPlayed.includes(CARD_ID)) return []
    const cardCrop = getCardCrop(player)
    if (cardCrop) return [] // already has a crop
    return [
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['vegetable'],
        sourceCard: CARD_ID,
      },
    ]
  },

  onSowExtraField: (player, tile, crop): boolean => {
    if (!player.minorPlayed.includes(CARD_ID)) return false
    if (!tileMatches(tile)) return false
    if (crop !== 'vegetable') return false // only vegetable allowed
    const cardCrop = getCardCrop(player)
    if (cardCrop) return false // already sown
    if (player.resources.vegetable <= 0) return false
    player.resources.vegetable -= 1
    setCardCrop(player, { crop: 'vegetable', remaining: 2 })
    return true
  },

  onHarvestFieldPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return
    player.resources.vegetable += 1
    cardCrop.remaining -= 1
    if (cardCrop.remaining <= 0) {
      setCardCrop(player, null)
      // Last vegetable harvested — return optional plow
      return { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true }
    }
    setCardCrop(player, cardCrop)
  },
})

// --- isDoable listener: make sow doable when card is empty + player has vegetable ---

const isDoableListener: CardListenerRegistration = {
  id: 'E69-melon-patch-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (!context.player.minorPlayed.includes(CARD_ID)) return
    if (canSow(context.player)) return
    const cardCrop = getCardCrop(context.player)
    if (cardCrop) return // card field occupied
    if (context.player.resources.vegetable <= 0) return
    return { doable: true }
  },
}

registerCardListener(isDoableListener)

export const E69_MelonPatch = new MinorImprovement({
  id: CARD_ID,
  name: 'Melon Patch',
  deck: 'E',
  number: 69,
  category: 'CROP_PROVIDER',
  desc: [
    'This card is a field that can only grow vegetables. Each time you harvest the last <VEGETABLE> from this card, you can plow 1 field.',
  ],
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
})
