import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import {
  registerSelectionEffect,
  registerSelectionValidator,
} from '../../../actions/helpers/selection-effect-registry'
import { commitFarmOperation } from '../../../domain/farm-operations'
import { positionKey, parsePositionKey } from '../../../domain/farm'
import {
  isCardFlagged,
  setCardFlag,
  readCardExtraData,
  writeCardExtraData,
} from '../../helpers/card-state'

const CARD_ID = 'CWM075_Downsizing'

const REMOVE = CARD_ID + '-room'
registerSelectionValidator(REMOVE, ({ player, positions }) => {
  if (
    player.houseType !== 'wood' ||
    player.rooms < 2 ||
    isCardFlagged(player, CARD_ID) ||
    positions.length !== 1 ||
    !player.roomTiles.some((t) => positionKey(t) === positions[0])
  )
    return 'log.actionNotAvailable'
})
registerSelectionEffect(REMOVE, ({ player, positions, eventSink, recordFarmOperation }) => {
  const tile = parsePositionKey(positions[0]!)!
  const receipt = commitFarmOperation(
    player,
    { kind: 'remove-rooms', positions: [tile], sourceCardId: CARD_ID },
    eventSink,
  )
  recordFarmOperation?.(receipt)
  setCardFlag(player, CARD_ID, true)
  writeCardExtraData(player, CARD_ID, 'activeFence', true)
})
const cardImpl = {
  listeners: [
    {
      id: CARD_ID + '-return-room',
      cardIds: [CARD_ID],
      actions: ['fence'],
      phases: ['before'],
      handler: ({ player }) => {
        if (
          isCardFlagged(player, CARD_ID) ||
          player.houseType !== 'wood' ||
          player.rooms < 2 ||
          player.resources.wood < 1
        )
          return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'leaf',
            actionId: 'selection',
            optional: true,
            sourceCard: CARD_ID,
            actionContext: {
              selectionKind: 'farm-position',
              selectionEffect: REMOVE,
              minSelections: 1,
              maxSelections: 1,
              selectableTiles: player.roomTiles.map(({ row, col }) => ({ row, col })),
            },
          },
        }
      },
    },
    {
      id: CARD_ID + '-free-fences',
      cardIds: [CARD_ID],
      actions: ['fence'],
      phases: ['computeCosts'],
      monotoneFenceCost: true,
      handler: ({ player, params }) => {
        if (
          !readCardExtraData(player, CARD_ID, 'activeFence') ||
          !Array.isArray(params?.newFenceEdges)
        )
          return
        const costs = { wood: -Math.min(7, Math.max(0, params.newFenceEdges.length - 1)) }
        return { costs, costAttribution: [{ sourceCard: CARD_ID, costs }] }
      },
    },
    {
      id: CARD_ID + '-finish',
      cardIds: [CARD_ID],
      actions: ['fence'],
      phases: ['after'],
      mandatory: true,
      handler: ({ player }) =>
        readCardExtraData(player, CARD_ID, 'activeFence')
          ? {
              sourceCard: CARD_ID,
              flow: {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'activeFence', value: false },
              },
            }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CWM075_Downsizing = defineMinorCard({
  meta: {
    id: 'CWM075_Downsizing',
    name: "Downsizing",
    deck: 'CWM',
    number: 75,
    desc: ["Once only, when building at least 1 fence, you may return a wooden room to build 7 additional fences for free. Items attached to the removed room are also removed; subsequent room counts use the reduced house size."],
    cost: {},
    vp: 2,
    prerequisite: "1 occupation",
    occupationPrerequisites: {
      min: 1,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM075.png',
  },
  impl: cardImpl,
})

export const CWM075_Downsizing_impl = CWM075_Downsizing.impl
