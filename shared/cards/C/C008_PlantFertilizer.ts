import { defineMinorCard } from '../card-source'
import { fieldIsEmpty, fieldTotalRemaining } from '../../domain/field'
import { readCardExtraData } from '../helpers/card-state'
import { wrapOptional } from '../../actions/flow'
import type { ActionFlow } from '../../contract/types'
import type { CardFieldStack } from '../helpers/card-field'
import type { PlantAdditionalGoodLocation } from '../../actions/effects/special-effect'
import type { CardImpl } from '../registry'

const CARD_ID = 'C008_PlantFertilizer'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player): ActionFlow | undefined => {
      const locations: PlantAdditionalGoodLocation[] = []

      for (const f of player.fields) {
        if (fieldIsEmpty(f)) continue
        if (fieldTotalRemaining(f) !== 1) continue
        locations.push({ kind: 'field', row: f.row, col: f.col })
      }

      const cardFieldHolders = [...player.minorPlayed, ...player.occupationPlayed]
      for (const cardId of cardFieldHolders) {
        const stacks = readCardExtraData<CardFieldStack[]>(player, cardId, 'cardFieldStacks')
        if (!stacks || stacks.length === 0) continue
        const total = stacks.reduce((acc, s) => acc + s.remaining, 0)
        if (total !== 1) continue
        locations.push({ kind: 'card-field', cardId })
      }

      if (locations.length === 0) return undefined

      return wrapOptional({
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'plant-additional-good', locations },
      })
    },
  },
  reaches: [] as readonly string[],
} satisfies CardImpl

export const C008_PlantFertilizer = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Plant Fertilizer",
    deck: "C",
    number: 8,
    category: "CROP_PROVIDER",
    desc: ["In each <FIELD> with exactly 1 good, you can immediately place 1 additional good of the same type."],
    cost: {},
    passing: true,
  },
  impl: cardImpl,
})

export const C008_PlantFertilizer_impl = C008_PlantFertilizer.impl
