import { fieldIsEmpty, fieldTotalRemaining } from '../../domain/field'
import { readCardExtraData } from '../helpers/card-state'
import { wrapOptional } from '../../actions/flow'
import type { ActionFlow, CropStack } from '../../contract/types'
import type { PlantAdditionalGoodLocation } from '../../actions/effects/special-effect'
import type { CardImpl } from '../registry'
import { C8_PlantFertilizer } from '../../cards-display/C/C8_PlantFertilizer'

const CARD_ID = C8_PlantFertilizer.id

const ALT_FIELD_CARDS = ['D75_WoodField', 'E80_RockGarden'] as const
const CARD_CROP_FIELD_CARDS = [
  'B68_Beanfield',
  'C70_LettucePatch',
  'D25_WitchesDanceFloor',
  'E68_CherryOrchard',
  'E69_MelonPatch',
  'E70_CropRotationField',
  'E72_ArtichokeField',
] as const

type CardCrop = {
  crop: CropStack['kind']
  remaining: number
}

export const C8_PlantFertilizer_impl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player): ActionFlow | undefined => {
      const locations: PlantAdditionalGoodLocation[] = []

      for (const f of player.fields) {
        if (fieldIsEmpty(f)) continue
        if (fieldTotalRemaining(f) !== 1) continue
        locations.push({ kind: 'field', row: f.row, col: f.col })
      }

      for (const altId of ALT_FIELD_CARDS) {
        if (!player.minorPlayed.includes(altId)) continue
        const stacks = readCardExtraData<CropStack[]>(player, altId, 'stacks') ?? []
        const total = stacks.reduce((acc, s) => acc + s.remaining, 0)
        if (total !== 1) continue
        locations.push({ kind: 'card-stacks', cardId: altId })
      }

      for (const cardId of CARD_CROP_FIELD_CARDS) {
        if (!player.minorPlayed.includes(cardId)) continue
        const cardCrop = readCardExtraData<CardCrop>(player, cardId, 'cardCrop')
        if (!cardCrop || cardCrop.remaining !== 1) continue
        locations.push({ kind: 'card-crop', cardId })
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
