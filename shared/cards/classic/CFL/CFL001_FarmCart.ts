import { BASE_SOW_AMOUNT } from '../../../domain/sow-amount'
import type { PlayerState } from '../../../contract/types'
import { defineMinorCard } from '../../card-source'
import { getLogicalFields, insertPreparedFieldLayer } from '../../helpers/card-field'
import { ensureCardState } from '../../helpers/card-state'

const CARD_ID = 'CFL001_FarmCart'

const plantingSites = (player: PlayerState) => getLogicalFields(player).flatMap(field => {
  if (field.stacks.length !== 1) return []
  const original = field.stacks[0]!.kind
  if (original !== 'grain' && original !== 'vegetable') return []
  const crop = original === 'grain' ? 'vegetable' as const : 'grain' as const
  if (field.allowedCrops && !field.allowedCrops.includes(crop)) return []
  const slot = field.slots.find(slot => slot.stack)
  if (!slot) return []
  // Occupied Card Field slots use a second Sow target for the layer below them.
  // The original slot remains the identity of the field and of later harvests.
  const tile = field.kind === 'card' ? { row: -2, col: slot.tile.col } : slot.tile
  return [{
    target: { fieldId: field.id, slot: slot.index },
    tile, crop, sourceCard: field.sourceCard ?? CARD_ID, groupKey: field.groupKey,
  }]
})

export const CFL001_FarmCart = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Farm Cart',
    deck: 'CFL',
    number: 1,
    cost: { wood: 3 },
    vp: 1,
    desc: ['Whenever you __Sow__, you may sow 1 <GRAIN> on an existing <VEGETABLE> <FIELD> or 1 <VEGETABLE> on an existing <GRAIN> <FIELD>. Each <FIELD> can hold at most one pile of each.'],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL001.png',
  },
  impl: {
    effect: {
      id: CARD_ID,
      onComputeSowableFields: player => plantingSites(player).map(site => ({
        tile: site.tile, allowedCrops: [site.crop], sourceCard: site.sourceCard,
        groupKey: site.groupKey, isField: true,
      })),
      onSowExtraField: (player, tile, crop, amount) => {
        const site = plantingSites(player).find(site =>
          site.tile.row === tile.row && site.tile.col === tile.col && site.crop === crop)
        if (!site || player.cardStates[CARD_ID]?.flagged || player.resources[crop] < 1) return false
        if (!insertPreparedFieldLayer(player, site.target, crop, amount ?? BASE_SOW_AMOUNT[crop]).ok) return false
        player.resources[crop] -= 1
        ensureCardState(player, CARD_ID).flagged = true
        return true
      },
    },
    listeners: [{
      id: CARD_ID + '-sow-limit',
      cardIds: [CARD_ID], actions: ['sow'], phases: ['immediatelyAfter'], mandatory: true,
      handler: ({ player }) => player.cardStates[CARD_ID]?.flagged
        ? { flow: { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-flag', flag: false } } }
        : undefined,
    }],
  },
})
