import { MinorImprovement } from '../types'
import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import type { CardImpl } from '../registry'

const CARD_ID = 'E70_CropRotationField'

type CardCrop = { crop: 'grain' | 'vegetable'; remaining: number }
const VIRTUAL_TILE: FarmTilePosition = { row: -1, col: 70 }
const VIRTUAL_KEY = '-1-70'

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

// --- isDoable listener: make sow doable when card field is available + seeds exist ---

const isDoableListener: CardListenerRegistration = {
  id: 'E70-crop-rotation-field-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    // If already doable via normal fields, no need to intervene
    if (canSow(context.player)) return
    // Check if card field is empty AND player has seeds
    const cardCrop = getCardCrop(context.player)
    if (cardCrop) return // Card already has a crop
    const hasSeeds =
      context.player.resources.grain > 0 || context.player.resources.vegetable > 0
    if (!hasSeeds) return
    return { doable: true }
  },
}

export const E70_CropRotationField = new MinorImprovement({
  id: CARD_ID,
  name: 'Crop Rotation Field',
  deck: 'E',
  number: 70,
  category: 'CROPS_-_VEGETABLE',
  desc: [
    'This card is a field. Each time you remove the last <GRAIN> or <VEGETABLE> from this card, you can immediately sow <VEGETABLE> or <GRAIN> on this card, respectively.',
  ],
  cost: {},
  prerequisite: '1 Occupation',
  occupationPrerequisites: { min: 1 },
  isField: true,
})

export const E70_CropRotationField_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  // Provide the virtual tile as a sowable field when the card has no crop
  onComputeSowableFields: (player): ExtraSowableField[] => {
    const cardCrop = getCardCrop(player)
    if (cardCrop) return [] // Already has a crop
    return [
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['grain', 'vegetable'],
        sourceCard: CARD_ID,
      },
    ]
  },

  // Handle sowing into the virtual tile
  onSowExtraField: (player, tile, crop): boolean => {
    if (tile.row !== VIRTUAL_TILE.row || tile.col !== VIRTUAL_TILE.col) return false
    if (crop !== 'grain' && crop !== 'vegetable') return false

    // Don't allow sowing if card already has a crop
    const existing = getCardCrop(player)
    if (existing) return false

    // Deduct resource
    if (player.resources[crop] <= 0) return false
    player.resources[crop] -= 1

    // Store sown crop
    const remaining = crop === 'grain' ? 3 : 2
    setCardCrop(player, { crop, remaining })
    return true
  },

  // Harvest from the card's field during harvest field phase
  onHarvestFieldPhase: (state, player) => {
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return

    const harvestedCrop = cardCrop.crop
    player.resources[harvestedCrop] += 1
    dispatchReapListener(state, player, harvestedCrop, 1)
    cardCrop.remaining -= 1

    if (cardCrop.remaining <= 0) {
      // Last crop harvested -- offer to sow the opposite
      setCardCrop(player, null)
      const oppositeCrop = harvestedCrop === 'grain' ? 'vegetable' : 'grain'
      if (player.resources[oppositeCrop] < 1) return // No seeds for opposite

      // Store virtual tile as allowed sow target
      writeCardExtraData(player, CARD_ID, 'selectedPositions', [VIRTUAL_KEY])

      return {
        type: 'leaf',
        actionId: 'sow',
        sourceCard: CARD_ID,
        optional: true,
        actionContext: { allowedFields: 'fromSelectedFields', sourceCard: CARD_ID },
      }
    }
    setCardCrop(player, cardCrop)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
