import { BASE_SOW_AMOUNT } from '../../../domain/sow-amount'
import type { PlayerState } from '../../../contract/types'
import { defineMinorCard } from '../../card-source'
import { getLogicalFields, mutateLogicalFields } from '../../helpers/card-field'

const CARD_ID = 'CFL001_FarmCart'

const plantingSites = (player: PlayerState) => getLogicalFields(player).flatMap(field => {
  if (field.stacks.length !== 1) return []
  const original = field.stacks[0]!.kind
  if (original !== 'grain' && original !== 'vegetable') return []
  const crop = original === 'grain' ? 'vegetable' as const : 'grain' as const
  if (field.allowedCrops && !field.allowedCrops.includes(crop)) return []
  const slot = field.slots.find(slot => slot.stack)
  if (!slot) return []
  return [{
    target: { fieldId: field.id, slot: slot.index },
    tile: slot.tile, crop, sourceCard: field.sourceCard ?? CARD_ID, groupKey: field.groupKey,
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
        groupKey: site.groupKey, isField: true, exclusiveSowGroup: CARD_ID,
      })),
      onSowExtraField: (player, tile, crop, amount, state) => {
        if (!state || player.resources[crop] < 1) return false
        const site = plantingSites(player).find(site =>
          site.tile.row === tile.row && site.tile.col === tile.col && site.crop === crop)
        if (!site) return false
        const fields = mutateLogicalFields(state, player, { emitEvents: false })
        if (!fields.insertBottom(site.target, crop, amount ?? BASE_SOW_AMOUNT[crop]).ok) return false
        player.resources[crop] -= 1
        return true
      },
    },
  },
})
