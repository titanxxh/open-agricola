import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { getUnusedFarmyardTilePositions } from '../../../domain/farmyard-usage-core'
import { getFarmyardSpaceStates } from '../../../domain/farmyard-space-states'
import { addFarmyardSpaceState, commitFarmOperation } from '../../../domain/farm-operations'
import { positionKey, parsePositionKey } from '../../../domain/farm'
import { computeAnimalZones } from '../../../domain/animal-zones'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import type { PlayerState } from '../../../contract/types'

const CARD_ID = 'CFL039_Cosmographer'

const PLACE = 'card_CFL039_Cosmographer_place'
const TAKE = 'card_CFL039_Cosmographer_take'
const tokens = (player: PlayerState) =>
  getFarmyardSpaceStates(player).filter(
    (token) => token.sourceCardId === CARD_ID && token.kind === 'farmyard-goods-token',
  )
const choiceAt = (player: PlayerState, key: string) => ({
  value: key,
  target: { kind: 'farm-cell' as const, playerId: player.id, positions: [parsePositionKey(key)!] },
  labelKey: 'ui.interactionFieldChoice',
  labelParams: {
    row: (parsePositionKey(key)?.row ?? 0) + 1,
    col: (parsePositionKey(key)?.col ?? 0) + 1,
  },
})
registerAdHocAction({
  id: PLACE,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => getUnusedFarmyardTilePositions(player).length >= 2,
  execute: ({ player }) => ({
    type: 'request',
    promptKey: 'ui.interactionFlowSelect',
    request: {
      kind: 'choice',
      options: getUnusedFarmyardTilePositions(player)
        .map(positionKey)
        .filter((key) => !tokens(player).some((token) => token.spaceKey === key))
        .map((key) => choiceAt(player, key)),
    },
  }),
  resolveChoice: ({ player, params, eventSink }, choice) => {
    const resource = params?.resource
    if (
      (resource !== 'reed' && resource !== 'stone') ||
      !getUnusedFarmyardTilePositions(player).some((tile) => positionKey(tile) === choice) ||
      tokens(player).some((token) => token.spaceKey === choice)
    )
      return { type: 'fail', errorKey: 'log.actionFail' }
    addFarmyardSpaceState(
      player,
      {
        spaceKey: choice,
        sourceCardId: CARD_ID,
        kind: 'farmyard-goods-token',
        resources: { [resource]: 1 },
      },
      eventSink,
    )
    return { type: 'ok' }
  },
})
registerAdHocAction({
  id: TAKE,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) => tokens(player).length > 0,
  execute: ({ player }) => ({
    type: 'request',
    promptKey: 'ui.interactionFlowSelect',
    request: {
      kind: 'choice',
      options: tokens(player).map((token) => choiceAt(player, token.spaceKey)),
    },
  }),
  resolveChoice: ({ player, eventSink }, choice) => {
    const token = tokens(player).find((token) => token.spaceKey === choice)
    if (!token) return { type: 'fail', errorKey: 'log.actionFail' }
    commitFarmOperation(
      player,
      {
        kind: 'space-states',
        positions: [],
        states: getFarmyardSpaceStates(player).filter(
          (item) => item.sourceCardId !== CARD_ID || item.spaceKey !== token.spaceKey,
        ),
        sourceCardId: CARD_ID,
      },
      eventSink,
    )
    return { type: 'flow', flow: gainLeaf(CARD_ID, token.resources ?? {}) }
  },
})

const cardImpl = {
  prerequisiteCheck: (player) => getUnusedFarmyardTilePositions(player).length >= 2,
  effect: {
    id: CARD_ID,
    onBuy: () => ({
      type: 'seq',
      children: ['reed', 'stone'].map((resource) => ({
        type: 'leaf',
        actionId: PLACE,
        sourceCard: CARD_ID,
        params: { resource },
      })),
    }),
    computeBonusScore: (state, player) =>
      tokens(player).reduce((sum, token) => {
        const position = parsePositionKey(token.spaceKey)
        if (!position) return sum
        const animal = token.resources?.reed ? 'sheep' : 'boar'
        const pasture = player.pastures.find((pasture) =>
          pasture.tiles.some((tile) => positionKey(tile) === token.spaceKey),
        )
        const matches = computeAnimalZones(player, state).some(
          (zone) =>
            (zone.animalCounts?.[animal] ??
              (zone.animalType === animal ? zone.animalCount : 0) ??
              0) > 0 &&
            ((zone.farmPosition && positionKey(zone.farmPosition) === token.spaceKey) ||
              (zone.zoneType === 'stable' && zone.id === `stable:${token.spaceKey}`) ||
              (zone.zoneType === 'house' && zone.id === `house:${token.spaceKey}`) ||
              (zone.zoneType === 'pasture' && zone.id === pasture?.id)),
        )
        return sum + (matches ? 2 : 0)
      }, 0),
  },
  listeners: [
    {
      id: CARD_ID + '-take',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ player }) =>
        tokens(player).length
          ? { flow: { type: 'leaf', actionId: TAKE, sourceCard: CARD_ID } }
          : undefined,
    },
  ],
} satisfies CardImpl

export const CFL039_Cosmographer = defineOccupationCard({
  meta: {
    id: 'CFL039_Cosmographer',
    name: 'Cosmographer',
    deck: 'CFL',
    number: 39,
    players: '1+',
    extraVp: true,
    desc: [
      'Immediately place 1 <REED> and 1 <STONE> from the general supply on two different unused farmyard spaces. They still count as unused. You may take either resource at any time. At scoring, the <REED> scores 2 bonus <SCORE> if it shares a space or pasture with <SHEEP>, and the <STONE> scores 2 bonus <SCORE> if it shares one with <PIG>.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL039.png',
  },
  impl: cardImpl,
})
