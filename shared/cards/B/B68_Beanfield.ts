import { MinorImprovement } from '../types'
import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import type { CardImpl } from '../registry'

const CARD_ID = 'B68_Beanfield'

type CardCrop = { crop: 'vegetable'; remaining: number }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

/** Virtual tile position -- unique per card, not a real farm tile. */
const VIRTUAL_TILE: FarmTilePosition = { row: -1, col: 68 }

const tileMatches = (tile: FarmTilePosition) =>
  tile.row === VIRTUAL_TILE.row && tile.col === VIRTUAL_TILE.col

// isDoable listener: make sow doable when card is empty + player has vegetable
const isDoableListener: CardListenerRegistration = {
  id: 'B68-beanfield-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (canSow(context.player)) return
    const cardCrop = getCardCrop(context.player)
    if (cardCrop) return // card field occupied
    if (context.player.resources.vegetable <= 0) return
    return { doable: true }
  },
}

export const B68_Beanfield = new MinorImprovement({
  id: CARD_ID,
  name: 'Beanfield',
  deck: 'B',
  number: 68,
  category: 'CROP_PROVIDER',
  desc: ['This card is a field that can only grow vegetables.'],
  cost: { food: 1 },
  vp: 1,
  prerequisite: '2 Occupations',
  occupationPrerequisites: { min: 2 },
  isField: true,
})

export const B68_Beanfield_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  onComputeSowableFields: (player): ExtraSowableField[] => {
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
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return
    player.resources.vegetable += 1
    cardCrop.remaining -= 1
    if (cardCrop.remaining <= 0) {
      setCardCrop(player, null)
    } else {
      setCardCrop(player, cardCrop)
    }
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
