import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { PlayerState } from '../../../contract/types'
import { getFarmyardTilePositions, positionKey, parsePositionKey } from '../../../domain/farm'
import { getUsedFarmyardTileKeys } from '../../../domain/farmyard-usage'
import {
  getFarmyardSpaceStates,
  getPlacementBlockedFarmyardSpaceKeys,
} from '../../../domain/farmyard-space-states'
import { addFarmyardSpaceState, commitFarmOperation } from '../../../domain/farm-operations'
import { fieldOperationFlow } from '../../../actions/plans/field-operation'
import { gainLeaf } from '../../helpers/pay-gain-node'

const CARD_ID = 'CWM040_Permaculturist'

const ownSpaces = (player: PlayerState) =>
  getFarmyardSpaceStates(player).filter(
    (s) =>
      s.sourceCardId === CARD_ID &&
      s.kind === 'non-field-crop-space' &&
      (s.crop?.remaining ?? 0) > 0,
  )
const available = (player: PlayerState) => {
  const used = getUsedFarmyardTileKeys(player),
    blocked = getPlacementBlockedFarmyardSpaceKeys(player)
  return getFarmyardTilePositions(player).filter(
    (t) => !used.has(positionKey(t)) && !blocked.has(positionKey(t)),
  )
}
const cardImpl = {
  effect: {
    id: CARD_ID,
    onComputeSowableFields: (player) =>
      available(player).map((tile) => ({ tile, allowedCrops: ['grain'], sourceCard: CARD_ID })),
    onSowExtraField: (player, tile, crop) => {
      if (
        crop !== 'grain' ||
        player.resources.grain < 1 ||
        !available(player).some((t) => positionKey(t) === positionKey(tile))
      )
        return false
      player.resources.grain--
      addFarmyardSpaceState(player, {
        spaceKey: positionKey(tile),
        sourceCardId: CARD_ID,
        kind: 'non-field-crop-space',
        crop: { kind: 'grain', remaining: 3 },
        blocksPlacement: true,
      })
      return true
    },
    onHarvestFieldPhase: (_state, player) => {
      const count = ownSpaces(player).length
      if (!count) return
      const states = getFarmyardSpaceStates(player).flatMap((s) =>
        s.sourceCardId !== CARD_ID || s.kind !== 'non-field-crop-space'
          ? [s]
          : (s.crop?.remaining ?? 0) > 1
            ? [{ ...s, crop: { kind: 'grain' as const, remaining: s.crop!.remaining - 1 } }]
            : [],
      )
      commitFarmOperation(player, {
        kind: 'space-states',
        states,
        positions: [],
        sourceCardId: CARD_ID,
      })
      return gainLeaf(CARD_ID, { grain: count })
    },
    onBeforeEndGame: (_state, player) => {
      commitFarmOperation(player, {
        kind: 'space-states',
        states: getFarmyardSpaceStates(player).filter((s) => s.sourceCardId !== CARD_ID),
        positions: [],
        sourceCardId: CARD_ID,
      })
    },
  },
  listeners: [
    {
      id: CARD_ID + '-discard',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) => {
        const tiles = ownSpaces(player).flatMap((s) => {
          const tile = parsePositionKey(s.spaceKey)
          return tile ? [tile] : []
        })
        return tiles.length
          ? {
              sourceCard: CARD_ID,
              flow: fieldOperationFlow(
                CARD_ID,
                { kind: 'discard-crop-spaces' },
                tiles,
                tiles.length,
              ),
            }
          : undefined
      },
    },
  ],
} satisfies CardImpl

export const CWM040_Permaculturist = defineOccupationCard({
  meta: {
    id: 'CWM040_Permaculturist',
    name: "Permaculturist",
    deck: 'CWM',
    number: 40,
    desc: ["You may sow <GRAIN> on unused farmyard spaces without adjacency to existing <FIELD>. Sown spaces count as used, but are not <FIELD>. You may remove their <GRAIN> at any time and must remove it before scoring. Effects that sow additional <GRAIN> <FIELD> do not apply to these spaces."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM040.png',
  },
  impl: cardImpl,
})

export const CWM040_Permaculturist_impl = CWM040_Permaculturist.impl
