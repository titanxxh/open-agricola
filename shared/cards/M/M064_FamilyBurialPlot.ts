import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import { getFarmyardTilePositions, positionKey } from '../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'
import { addFarmyardSpaceState, getFarmyardSpaceStates } from '../../domain/farmyard-space-states'
import type { ActionFlow } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'M064_FamilyBurialPlot'
const SELECTION_EFFECT = 'm064-family-burial-plot-place-tombstone'

const availableTiles = (player: Parameters<typeof getUsedFarmyardTileKeys>[0]) => {
  const used = getUsedFarmyardTileKeys(player)
  return getFarmyardTilePositions(player).filter((tile) => !used.has(positionKey(tile)))
}

registerSelectionEffect(SELECTION_EFFECT, ({ player, positions }) => {
  const spaceKey = positions[0]
  if (!spaceKey) return
  addFarmyardSpaceState(player, {
    spaceKey,
    sourceCardId: CARD_ID,
    kind: 'blocked-farmyard-space',
    bonusVp: 1,
    blocksPlacement: true,
  })
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => {
      const selectableTiles = availableTiles(player)
      if (selectableTiles.length === 0) return
      return {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectableTiles,
          minSelections: 1,
          maxSelections: 1,
          selectionEffect: SELECTION_EFFECT,
        },
      } satisfies ActionFlow
    },
    computeBonusScore: (_state, player) =>
      getFarmyardSpaceStates(player)
        .filter((state) => state.sourceCardId === CARD_ID)
        .reduce((sum, state) => sum + (state.bonusVp ?? 0), 0),
  },
  prerequisiteCheck: (player) => player.houseType === 'stone',
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M064_FamilyBurialPlot = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "Family Burial Plot",
    deck: "M",
    number: 64,
    category: "POINTS_PROVIDER",
    desc: [
        "When you play this card, you can immediately place the \"Tombstone\" token on an unused farmyard space. That space counts as used but it is blocked for the rest of the game. During scoring, it is worth 1 additional bonus point."
    ],
    cost: {
        "stone": 1
    },
    vp: 1,
    extraVp: true,
    prerequisite: "Stone House",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})
