import { MinorImprovement } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'

const CARD_ID = 'C71_SlurrySpreader'
const BEFORE_BREEDING_KEY = 'animalsBeforeBreeding'

const readBreedingAnimals = (player: Parameters<typeof writeCardExtraData>[0]) => ({
  sheep: player.resources.sheep ?? 0,
  boar: player.resources.boar ?? 0,
  cattle: player.resources.cattle ?? 0,
})

registerCardEffect({
  id: CARD_ID,
  onEndHarvestFeedingPhase: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    writeCardExtraData(player, CARD_ID, BEFORE_BREEDING_KEY, readBreedingAnimals(player))
  },
  onEndHarvest: (_state, player) => {
    if (!player.minorPlayed.includes(CARD_ID)) return
    const before = readCardExtraData<Record<'sheep' | 'boar' | 'cattle', number>>(
      player,
      CARD_ID,
      BEFORE_BREEDING_KEY,
    )
    if (!before) return
    const after = readBreedingAnimals(player)
    const newbornTypes = (['sheep', 'boar', 'cattle'] as const).filter(
      (animalType) => (after[animalType] ?? 0) > (before[animalType] ?? 0),
    )
    if (newbornTypes.length < 2) return
    return {
      type: 'leaf',
      actionId: 'sow',
      optional: true,
      promptKey: 'ui.interactionSowSelect',
      sourceCard: CARD_ID,
    }
  },
})

export const C71_SlurrySpreader = new MinorImprovement({
  id: CARD_ID,
  name: "Slurry Spreader",
  deck: "C",
  number: 71,
  category: "CROP_PROVIDER",
  desc: ["In the breeding phase of each harvest, if you get newborn animals of at least two types, you also get a __Sow__ action."],
  cost: {},
})
