import type { ExtraSowableField } from '../card-effects'
import type { CardListenerRegistration, CardListenerContext } from '../card-listeners'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { FarmTilePosition, PlayerState } from '../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import { canSow } from '../../actions/effects/sow'
import { dispatchReapListener } from '../../actions/effects/reap'
import type { CardImpl } from '../registry'
import { E68_CherryOrchard } from '../../cards-display/E/E68_CherryOrchard'

const CARD_ID = E68_CherryOrchard.id

const VIRTUAL_TILE: FarmTilePosition = { row: -1, col: 68 }

type CardCrop = { crop: 'wood'; remaining: number }

const getCardCrop = (player: PlayerState): CardCrop | null =>
  readCardExtraData<CardCrop>(player, CARD_ID, 'cardCrop') ?? null

const setCardCrop = (player: PlayerState, crop: CardCrop | null) =>
  writeCardExtraData(player, CARD_ID, 'cardCrop', crop)

const tileMatches = (tile: FarmTilePosition) =>
  tile.row === VIRTUAL_TILE.row && tile.col === VIRTUAL_TILE.col

const isDoableListener: CardListenerRegistration = {
  id: 'E68-cherry-orchard-isdoable-sow',
  cardIds: [CARD_ID],
  phases: ['isDoable' as ActionHookPhase],
  actions: ['sow'],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    if (canSow(context.player)) return
    if (getCardCrop(context.player)) return
    if (context.player.resources.wood <= 0) return
    return { doable: true }
  },
}

export const E68_CherryOrchard_impl = {
  listeners: [isDoableListener],
  effect: {
  id: CARD_ID,

  onComputeSowableFields: (player): ExtraSowableField[] => {
    if (getCardCrop(player)) return []
    return [
      {
        tile: VIRTUAL_TILE,
        allowedCrops: ['wood'],
        sourceCard: CARD_ID,
      },
    ]
  },

  onSowExtraField: (player, tile, rawCrop): boolean => {
    if (!tileMatches(tile)) return false
    if (getCardCrop(player)) return false

    const crop = rawCrop as 'grain' | 'vegetable' | 'wood'
    if (crop !== 'wood') return false
    if (player.resources.wood <= 0) return false

    player.resources.wood -= 1
    setCardCrop(player, { crop: 'wood', remaining: 3 })
    return true
  },

  onHarvestFieldPhase: (state, player) => {
    const cardCrop = getCardCrop(player)
    if (!cardCrop || cardCrop.remaining <= 0) return

    player.resources.wood += 1
    cardCrop.remaining -= 1

    if (cardCrop.remaining <= 0) {
      player.resources.vegetable += 1
      dispatchReapListener(state, player, 'vegetable', 1)
      setCardCrop(player, null)
      return
    }

    setCardCrop(player, cardCrop)
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
