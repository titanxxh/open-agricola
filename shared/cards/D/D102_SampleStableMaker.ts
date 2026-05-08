import { Occupation } from '../types'
import { addCardResourceGained } from '../helpers/card-state'
import { addResourcesFromCards } from '../../session/stats'
import { registerSelectionEffect } from '../../actions/helpers/selection-effect-registry'
import {
  listReturnableStableTiles,
  removeStableOrFarmHandAtTile,
} from '../helpers/stable-removal'
import type { ActionFlow, FarmTilePosition } from '../../contract/types'
import type { CardImpl } from '../registry'

const CARD_ID = 'D102_SampleStableMaker'
const FIELD_EFFECT = 'sample-stable-maker-return'

/**
 * D102 Sample Stable Maker (Occupation, D, 102):
 * - onStartReturnHome: if the player has at least one built stable (normal
 *   or the B85 FarmHand stable), they may return 1 stable to supply. In
 *   exchange: gain 1 WOOD + 1 GRAIN + 1 FOOD and then optionally play a
 *   minor improvement.
 *
 * BGA (D102_SampleStableMaker.php lines 42-111): player can always choose
 * whether to use the effect (NODE_SEQ optional). A single-stable shortcut
 * skips the selection step.
 *
 * Candidate listing + removal dispatch go through
 * `shared/cards/helpers/stable-removal.ts` so this card stays agnostic
 * of the FarmHand storage layout (see spec §3.5.1).
 */
registerSelectionEffect(FIELD_EFFECT, ({ player, positions, sourceCard }) => {
  if (positions.length === 0) return
  const [rowStr, colStr] = positions[0]!.split('-')
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isFinite(row) || !Number.isFinite(col)) return
  const tile: FarmTilePosition = { row, col }
  const kind = removeStableOrFarmHandAtTile(player, tile)
  if (!kind) return

  const gain = { wood: 1, grain: 1, food: 1 } as const
  player.resources.wood = (player.resources.wood ?? 0) + gain.wood
  player.resources.grain = (player.resources.grain ?? 0) + gain.grain
  player.resources.food = (player.resources.food ?? 0) + gain.food
  if (sourceCard) {
    addCardResourceGained(player, sourceCard, gain)
  }
  addResourcesFromCards(player, gain)
})

export const D102_SampleStableMaker = new Occupation({
  id: CARD_ID,
  name: 'Sample Stable Maker',
  deck: 'D',
  number: 102,
  category: 'GOODS_PROVIDER',
  desc: [
    'At the start of each returning home phase, you can return a built stable to your supply to get 1 <WOOD>, 1 <GRAIN>, 1 <FOOD>, and a __Minor Improvement__ action.',
  ],
  cost: {},
  players: '1+',
})

export const D102_SampleStableMaker_impl = {
  effect: {
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    const selectableTiles = listReturnableStableTiles(player)
    if (selectableTiles.length === 0) return

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'selection',
          sourceCard: CARD_ID,
          actionContext: {
            selectionKind: 'farm-position',
            selectionEffect: FIELD_EFFECT,
            maxSelections: 1,
            selectableTiles,
          },
        },
        {
          type: 'leaf',
          actionId: 'improvement-any',
          sourceCard: CARD_ID,
          optional: true,
          params: { allowedTypes: ['minor'], allowedPurchases: [] },
        },
      ],
    }
    // Let the minor-improvement leaf be optional (the player may decline).
    // The generic 'minor-improvement' leaf is the proper way, but our action
    // dispatcher routes minor plays through 'minor-improvement' / 'improvement-any'.
    // We use 'minor-improvement' directly to restrict choices to minor cards.
    flow.children[1] = {
      type: 'leaf',
      actionId: 'minor-improvement',
      sourceCard: CARD_ID,
      optional: true,
    }
    return flow
  },
},
  reaches: [] as readonly string[],
} satisfies CardImpl
