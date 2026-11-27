import { getPlowableTiles } from '../../../actions/effects/plow'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import type { FarmTilePosition, PlayerState } from '../../../contract/types'
import { positionKey } from '../../../domain/farm'
import { defineMinorCard } from '../../card-source'
import { getFarmyardFields } from '../../helpers/card-field'
import { readCardExtraData } from '../../helpers/card-state'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM105_RotherhamPlow'
const SECOND_PLOW_ACTION_ID = 'card_CWM105_RotherhamPlow_second-plow'
const PRE_FIELDS_KEY = 'preFieldKeys'

const isNonAdjacent = (a: FarmTilePosition, b: FarmTilePosition): boolean =>
  Math.abs(a.row - b.row) > 1 || Math.abs(a.col - b.col) > 1

const legalFirstPlowTiles = (player: PlayerState): FarmTilePosition[] => {
  if (getFarmyardFields(player).length === 0) return []
  const plowable = getPlowableTiles(player)
  return plowable.filter((first) => plowable.some((second) => isNonAdjacent(first, second)))
}

const currentSecondPlowTiles = (player: PlayerState): FarmTilePosition[] => {
  const preKeys = new Set(readCardExtraData<string[]>(player, CARD_ID, PRE_FIELDS_KEY) ?? [])
  const firstPlowed = getFarmyardFields(player).find((field) => !preKeys.has(positionKey(field)))
  if (!firstPlowed) return []
  return getPlowableTiles(player).filter((candidate) => isNonAdjacent(firstPlowed, candidate))
}

registerAdHocAction({
  id: SECOND_PLOW_ACTION_ID,
  nameKey: 'actions.plow.name',
  descriptionKey: 'actions.plow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => currentSecondPlowTiles(player).length > 0,
  execute: ({ player }) => {
    const allowedTiles = currentSecondPlowTiles(player)
    if (allowedTiles.length === 0) return { type: 'fail', errorKey: 'log.actionFail' }
    return {
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: 'plow',
        sourceCard: CARD_ID,
        actionContext: { allowedTiles },
      },
    }
  },
})

const isFarmlandSpaceBodyPlow = (actionContext: Record<string, unknown> | undefined): boolean => {
  if (actionContext?.checkedReplaceAction === true) return false
  const origin = actionContext?.sourceLocation as { kind?: unknown; spaceId?: unknown } | undefined
  return origin?.kind === 'actionSpace' && origin.spaceId === 'farmland'
}

const cardImpl = {
  listeners: [
    {
      id: `${CARD_ID}-replace-plow`,
      cardIds: [CARD_ID],
      actions: ['plow'],
      phases: ['computeReplace'],
      handler: (context) => {
        if (!isFarmlandSpaceBodyPlow(context.actionContext)) return
        const allowedFirstTiles = legalFirstPlowTiles(context.player)
        if (allowedFirstTiles.length === 0) return
        return {
          decline: true,
          sourceCard: CARD_ID,
          alternativeFlow: {
            type: 'seq',
            choiceLabelKey: `cards.${CARD_ID}.name`,
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                countCardUse: false,
                params: {
                  kind: 'set-extra-data',
                  key: PRE_FIELDS_KEY,
                  value: getFarmyardFields(context.player).map((field) => positionKey(field)),
                },
              },
              {
                type: 'leaf',
                actionId: 'plow',
                sourceCard: CARD_ID,
                actionContext: { allowedTiles: allowedFirstTiles },
              },
              {
                type: 'leaf',
                actionId: SECOND_PLOW_ACTION_ID,
                sourceCard: CARD_ID,
              },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM105_RotherhamPlow = defineMinorCard({
  meta: {
    id: CARD_ID,
    name: 'Rotherham Plow',
    deck: 'CWM',
    number: 105,
    cost: { wood: 2 },
    vp: 0,
    prerequisite: '1 Occupation',
    occupationPrerequisites: { min: 1 },
    desc: [
      'Whenever you use the __space:farmland|Farmland__ action space, you may plow 2 <FIELD> if they are not diagonally or orthogonally adjacent to each other instead of 1.',
    ],
    artUrl: 'assets/classic/CWM/CWM105.png',
    implemented: true,
  },
  impl: cardImpl,
})

export const CWM105_RotherhamPlow_impl = CWM105_RotherhamPlow.impl
