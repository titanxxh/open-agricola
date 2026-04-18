import { Occupation } from '../types'
import { registerCardEffect } from '../card-effects'
import { addCardResourceGained } from '../helpers/card-state'
import { registerSelectionEffect } from '../../actions/effects/selection-effect-registry'
import { removeStableAtTile } from '../helpers/stable-removal'
import type { ActionFlow, FarmTilePosition } from '../../game/types'

const CARD_ID = 'D102_SampleStableMaker'
const FIELD_EFFECT = 'sample-stable-maker-return'

/**
 * D102 Sample Stable Maker (Occupation, D, 102):
 * - onStartReturnHome: if the player has at least one built stable, they may
 *   return 1 stable to supply. In exchange: gain 1 WOOD + 1 GRAIN + 1 FOOD
 *   and then optionally play a minor improvement.
 *
 * BGA (D102_SampleStableMaker.php lines 42-111): player can always choose
 * whether to use the effect (NODE_SEQ optional). A single-stable shortcut
 * skips the selection step. Our implementation skips the Farm Hand branch
 * since our B85 FarmHand does not create a dedicated stable tile.
 */
registerSelectionEffect(FIELD_EFFECT, ({ player, fields, sourceCard }) => {
  if (fields.length === 0) return
  const [rowStr, colStr] = fields[0]!.split(',')
  const row = Number(rowStr)
  const col = Number(colStr)
  if (!Number.isFinite(row) || !Number.isFinite(col)) return
  const tile: FarmTilePosition = { row, col }
  const removed = removeStableAtTile(player, tile)
  if (!removed) return

  const gain = { wood: 1, grain: 1, food: 1 } as const
  player.resources.wood = (player.resources.wood ?? 0) + gain.wood
  player.resources.grain = (player.resources.grain ?? 0) + gain.grain
  player.resources.food = (player.resources.food ?? 0) + gain.food
  if (sourceCard) {
    addCardResourceGained(player, sourceCard, gain)
  }
})

registerCardEffect({
  id: CARD_ID,
  onStartReturnHome: (_state, player) => {
    if (!player.occupationPlayed.includes(CARD_ID)) return
    if (player.stableTiles.length === 0) return

    const selectableTiles = player.stableTiles.map((t) => ({
      row: t.row,
      col: t.col,
    }))

    const flow: ActionFlow = {
      type: 'seq',
      optional: true,
      children: [
        {
          type: 'leaf',
          actionId: 'field-select',
          sourceCard: CARD_ID,
          actionContext: {
            selectionEffect: FIELD_EFFECT,
            maxSelections: 1,
            farmType: 'stable',
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
