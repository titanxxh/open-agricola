import { validatePlowSelection } from '../../../domain/farmyard'
import { getFarmyardFields } from '../../helpers/card-field'
import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { PlayerState } from '../../../contract/types'
import { buildPlowFarmInteraction } from '../../../domain/farmyard-interaction'
import { positionKey } from '../../../domain/farm'
import { classicPlowUseTaken, plowUseContribution } from '../../helpers/classic-plow'
import { readCardExtraData } from '../../helpers/card-state'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CWM105_RotherhamPlow'

const candidates = (player: PlayerState) => {
  const request = buildPlowFarmInteraction(player)
  return request.farmType === 'plow' ? request.selectableTiles : []
}
const SECOND = 'card_' + CARD_ID + '_second'
registerAdHocAction({
  id: SECOND,
  nameKey: 'actions.plow.name',
  descriptionKey: 'actions.plow.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ player }) => {
    const previous = readCardExtraData<string[]>(player, CARD_ID, 'previousFields') ?? []
    const first = getFarmyardFields(player).find((f) => !previous.includes(positionKey(f)))
    if (!first) return { type: 'fail', errorKey: 'log.plowFail' }
    return {
      type: 'flow',
      flow: {
        type: 'leaf',
        actionId: 'plow',
        sourceCard: CARD_ID,
        actionContext: {
          allowedTiles: candidates(player).filter(
            (t) => Math.abs(t.row - first.row) > 1 || Math.abs(t.col - first.col) > 1,
          ),
        },
      },
    }
  },
})
const cardImpl = {
  effect: { id: CARD_ID, getRuleContributions: plowUseContribution(CARD_ID) },
  listeners: [
    {
      id: CARD_ID + '-double-plow',
      cardIds: [CARD_ID],
      actionSpaces: ['farmland'],
      phases: ['computeReplace'],
      handler: (context) => {
        const useId = context.actionSpaceUse?.useId
        if (context.space.id !== 'farmland' || !useId || classicPlowUseTaken(context.state, useId))
          return
        const firstTiles = candidates(context.player).filter((first) => {
          const projected = validatePlowSelection(context.player, first)
          return (
            projected.ok &&
            candidates(projected.player).some(
              (t) => Math.abs(t.row - first.row) > 1 || Math.abs(t.col - first.col) > 1,
            )
          )
        })
        if (!firstTiles.length) return
        return {
          sourceCard: CARD_ID,
          decline: true,
          alternativeFlow: {
            type: 'seq',
            children: [
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: { kind: 'set-extra-data', key: 'plowUse', value: useId },
              },
              {
                type: 'leaf',
                actionId: 'special-effect',
                sourceCard: CARD_ID,
                params: {
                  kind: 'set-extra-data',
                  key: 'previousFields',
                  value: getFarmyardFields(context.player).map(positionKey),
                },
              },
              {
                type: 'leaf',
                actionId: 'plow',
                sourceCard: CARD_ID,
                actionContext: { allowedTiles: firstTiles },
              },
              { type: 'leaf', actionId: SECOND, sourceCard: CARD_ID },
            ],
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM105_RotherhamPlow = defineMinorCard({
  meta: {
    id: 'CWM105_RotherhamPlow',
    name: "Rotherham Plow",
    deck: 'CWM',
    number: 105,
    desc: ["Whenever you use Farmland, you may plow 1 additional field, but the two new fields must be neither orthogonally nor diagonally adjacent. All fields must still form a connected group. Only one plow or Harrow effect may be used per Farmland or Cultivation visit."],
    cost: {
      wood: 1,
    },
    vp: 0,
    prerequisite: "1 occupation",
    occupationPrerequisites: {
      min: 1,
    },
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM105.png',
  },
  impl: cardImpl,
})

export const CWM105_RotherhamPlow_impl = CWM105_RotherhamPlow.impl
