import { defineMinorCard } from '../card-source'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import type { ActionHookPhase, ActionHookResult } from '../../actions/hooks'
import type { CardListenerContext, CardListenerRegistration } from '../card-listeners'
import type { ActionFlow, FarmTilePosition, PlayerState } from '../../contract/types'
import type { ExtraSowableField } from '../card-effects'
import { getFarmyardTilePositions, parsePositionKey, positionKey } from '../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../domain/farmyard-usage'
import {
  addFarmyardSpaceState,
  getFarmyardSpaceStates,
  getPlacementBlockedFarmyardSpaceKeys,
} from '../../domain/farmyard-space-states'
import type { CardImpl } from '../registry'
import { getLogicalFields } from '../helpers/card-field'

const CARD_ID = 'M111_NoTillFarming'
const DISCARD_EFFECT = 'm111-no-till-farming-discard-crops'

const cropSpaces = (player: PlayerState) =>
  getFarmyardSpaceStates(player).filter((state) =>
    state.sourceCardId === CARD_ID &&
    state.kind === 'non-field-crop-space' &&
    (state.crop?.remaining ?? 0) > 0,
  )

const discardableTiles = (player: PlayerState): FarmTilePosition[] =>
  cropSpaces(player).flatMap((state) => {
    const tile = parsePositionKey(state.spaceKey)
    return tile ? [tile] : []
  })

registerSelectionEffect(DISCARD_EFFECT, ({ player, positions }) => {
  const selected = new Set(positions)
  player.farmyardSpaceStates = getFarmyardSpaceStates(player).filter((state) =>
    !(
      state.sourceCardId === CARD_ID &&
      state.kind === 'non-field-crop-space' &&
      selected.has(state.spaceKey)
    ),
  )
})

const reapCropSpaces = (player: PlayerState) => {
  const next = []
  for (const state of getFarmyardSpaceStates(player)) {
    if (
      state.sourceCardId !== CARD_ID ||
      state.kind !== 'non-field-crop-space' ||
      !state.crop ||
      state.crop.remaining <= 0
    ) {
      next.push(state)
      continue
    }
    player.resources[state.crop.kind] += 1
    const remaining = state.crop.remaining - 1
    if (remaining > 0) {
      next.push({ ...state, crop: { ...state.crop, remaining } })
    }
  }
  player.farmyardSpaceStates = next
}

const anytimeListener: CardListenerRegistration = {
  id: 'M111-no-till-farming-discard-crops',
  cardIds: [CARD_ID],
  phases: ['anytime' as ActionHookPhase],
  handler: (context: CardListenerContext): ActionHookResult | void => {
    const tiles = discardableTiles(context.player)
    if (tiles.length === 0) return
    return {
      flow: {
        type: 'leaf',
        actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectionEffect: DISCARD_EFFECT,
          minSelections: 1,
          maxSelections: tiles.length,
          selectableTiles: tiles,
        },
      } satisfies ActionFlow,
      sourceCard: CARD_ID,
      labelKey: 'cards.M111_NoTillFarming.anytime',
    }
  },
}

const availableExtraFields = (player: Parameters<typeof getUsedFarmyardTileKeys>[0]): ExtraSowableField[] => {
  const used = getUsedFarmyardTileKeys(player)
  const blocked = getPlacementBlockedFarmyardSpaceKeys(player)
  return getFarmyardTilePositions(player).flatMap((tile) => {
    const key = positionKey(tile)
    if (used.has(key) || blocked.has(key)) return []
    return [{
      tile,
      allowedCrops: ['grain', 'vegetable'],
      sourceCard: CARD_ID,
    }]
  })
}

const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeSowableFields: (player) => availableExtraFields(player),
    onSowExtraField: (player, tile, crop) => {
      if (crop !== 'grain' && crop !== 'vegetable') return false
      const key = positionKey(tile)
      if (getUsedFarmyardTileKeys(player).has(key)) return false
      if (getPlacementBlockedFarmyardSpaceKeys(player).has(key)) return false
      if (cropSpaces(player).length >= 2) return false
      if ((player.resources[crop] ?? 0) <= 0) return false
      player.resources[crop] -= 1
      addFarmyardSpaceState(player, {
        spaceKey: key,
        sourceCardId: CARD_ID,
        kind: 'non-field-crop-space',
        crop: { kind: crop, remaining: crop === 'grain' ? 3 : 2 },
      })
      return true
    },
    onHarvestFieldPhase: (_state, player) => {
      reapCropSpaces(player)
    },
  },
  listeners: [anytimeListener],
  prerequisiteCheck: (player) => getLogicalFields(player).length >= 2,
  reaches: [] as readonly string[],
} satisfies CardImpl

export const M111_NoTillFarming = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: "No-Till Farming",
    deck: "M",
    number: 111,
    category: "CROP_PROVIDER",
    desc: [
        "You can plant <GRAIN> or <VEGETABLE> on up to 2 unused farmyard spaces. Even if you do, these farmyard spaces are not considered <FIELD> but still unused. You can discard crops from these farmyard spaces at any time."
    ],
    cost: {},
    prerequisite: "2 Fields",
    implemented: true,
    requiresFarmersOfTheMoor: true,
  },
  impl: cardImpl,
})

export const M111_NoTillFarming_impl = M111_NoTillFarming.impl
