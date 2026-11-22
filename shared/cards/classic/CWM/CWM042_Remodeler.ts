import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerSelectionEffect } from '../../../actions/helpers/selection-effect-registry'
import { listReturnableStableTiles, returnStableAtTile } from '../../helpers/stable-removal'
import { parsePositionKey } from '../../../domain/farm'

const CARD_ID = 'CWM042_Remodeler'

const SELECT = CARD_ID + '-stable'
registerSelectionEffect(SELECT, ({ player, positions }) => {
  const tile = positions.length === 1 ? parsePositionKey(positions[0]!) : null
  if (player.houseType !== 'wood' || !tile || !returnStableAtTile(player, tile)) return
  return {
    type: 'leaf',
    actionId: 'construct',
    sourceCard: CARD_ID,
    actionContext: { exactCost: {}, max: 1 },
  }
})
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-renovate',
      cardIds: [CARD_ID],
      actions: ['renovate-house'],
      phases: ['before'],
      handler: ({ player }) => {
        const tiles = listReturnableStableTiles(player)
        return player.houseType === 'wood' && tiles.length
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'selection',
                sourceCard: CARD_ID,
                optional: true,
                actionContext: {
                  selectionKind: 'farm-position',
                  selectionEffect: SELECT,
                  minSelections: 1,
                  maxSelections: 1,
                  selectableTiles: tiles,
                },
              },
            }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM042_Remodeler = defineOccupationCard({
  meta: {
    id: 'CWM042_Remodeler',
    name: "Remodeler",
    deck: 'CWM',
    number: 42,
    desc: ["Immediately before renovating your wooden house, you may return one built stable to your supply and build 1 wooden room for free."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM042.png',
  },
  impl: cardImpl,
})

export const CWM042_Remodeler_impl = CWM042_Remodeler.impl
