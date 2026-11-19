export type SowCrop = 'grain' | 'vegetable' | 'wood' | 'stone'

/** Goods placed on a field by an unmodified Sow, including the seed itself. */
export const BASE_SOW_AMOUNT: Readonly<Record<SowCrop, number>> = Object.freeze({
  grain: 3, vegetable: 2, wood: 3, stone: 2,
})

/** A Sow always leaves at least the seed on the field. */
export const MIN_SOW_AMOUNT = 1
