import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { readCardExtraData, writeCardExtraData } from '../helpers/card-state'
import type { ActionFlow } from '../../game/types'

const CARD_ID = 'E112_GrainThief'
const PROTECTED_KEY = 'protectedFields'

registerCardEffect({
  id: CARD_ID,
  onHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    // Clear stale data
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, null)
    const grainFields = player.fields
      .map((f, i) => ({ field: f, index: i }))
      .filter(({ field }) => field.crop === 'grain' && field.remaining > 0)
    if (grainFields.length === 0) return
    const children: ActionFlow[] = grainFields.map(({ field, index }) => ({
      type: 'xor' as const,
      children: [
        {
          type: 'leaf' as const,
          actionId: 'grain-thief-protect',
          params: { fieldIndex: index },
          sourceCard: CARD_ID,
          choiceLabelKey: 'ui.grainThiefProtect',
          choiceLabelParams: { remaining: field.remaining },
        },
        {
          type: 'leaf' as const,
          actionId: 'noop',
          choiceLabelKey: 'ui.grainThiefNormalHarvest',
        },
      ],
    }))
    return { type: 'seq', children }
  },
  onEndHarvestFieldPhase: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    const protectedFields = readCardExtraData<{ index: number; remaining: number }[]>(
      player, CARD_ID, PROTECTED_KEY,
    ) ?? []
    writeCardExtraData(player, CARD_ID, PROTECTED_KEY, null)
    for (const { index, remaining } of protectedFields) {
      const field = player.fields[index]
      if (!field) continue
      field.crop = 'grain'
      field.remaining = remaining
    }
  },
})

export const E112_GrainThief = new Occupation({
  id: "E112_GrainThief",
  name: "Grain Thief",
  deck: "E",
  number: 112,
  desc: ["Each time you would harvest a grain field, you can leave the grain on the field and take 1 <GRAIN> from the general supply instead."],
  cost: {},
  players: "1+",
})
