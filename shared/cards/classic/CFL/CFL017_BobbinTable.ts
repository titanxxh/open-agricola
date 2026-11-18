import { definePlayerActionCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import {
  registerPlayerActionSpace,
  createPlayerActionSpaces,
  definePlayerActionSpaceFlow,
} from '../../player-action-space'
import { isCardFlagged } from '../../helpers/card-state'
import { OCCUPIED_SPACE_CHOICE_PREFIX } from '../../../actions/helpers/placement-constants'
import { canPlaceWorkerOnSpace } from '../../../actions/helpers/placement-availability'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CFL017_BobbinTable'

const KEEP_MARKER = 'card_CFL017_BobbinTable_keepMarker'
registerAdHocAction({
  id: KEEP_MARKER,
  nameKey: 'actions.set-first-player.name',
  descriptionKey: 'actions.set-first-player.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: () => ({ type: 'ok' }),
})
registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: (ownerId) =>
    definePlayerActionSpaceFlow({
      id: CARD_ID,
      nameKey: `cards.${CARD_ID}.name`,
      descriptionKey: `cards.${CARD_ID}.name`,
      canBeExecutedByPlayer: (_state, player) => player.id === ownerId,
      flowFactory: () => ({
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-flag', flag: true },
      }),
    }),
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state) => {
      state.actionSpaces.push(
        ...createPlayerActionSpaces(state).filter(
          (space) => !state.actionSpaces.some((existing) => existing.id === space.id),
        ),
      )
    },
    onStartHarvest: () => ({
      type: 'leaf',
      actionId: 'special-effect',
      sourceCard: CARD_ID,
      params: { kind: 'set-flag', flag: false },
    }),
  },
  listeners: [
    {
      id: CARD_ID + '-occupied',
      cardIds: [CARD_ID],
      actions: ['place-farmer'],
      phases: ['computeArgs'],
      handler: ({ state, player, actionHooks }) =>
        isCardFlagged(player, CARD_ID)
          ? {
              extraOptions: state.actionSpaces
                .filter(
                  (space) =>
                    space.takenBy.length > 0 &&
                    canPlaceWorkerOnSpace(state, player, space, {
                      actionHooks,
                      sourceCard: CARD_ID,
                      allowOccupied: true,
                    }),
                )
                .map((space) => ({
                  value: `${OCCUPIED_SPACE_CHOICE_PREFIX}${space.id}`,
                  labelKey: space.nameKey,
                  sourceCard: CARD_ID,
                })),
            }
          : undefined,
    },
    {
      id: CARD_ID + '-first-player-once',
      cardIds: [CARD_ID],
      actions: ['set-first-player'],
      phases: ['computeReplace'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        if (
          !isCardFlagged(owner, CARD_ID) ||
          !context.state.events.some(
            (event) => event.type === 'startPlayer.changed' && event.round === context.state.round,
          )
        )
          return
        return { actionId: KEEP_MARKER, sourceCard: CARD_ID }
      },
    },
  ],
} satisfies CardImpl

export const CFL017_BobbinTable = definePlayerActionCard({
  meta: {
    id: 'CFL017_BobbinTable',
    name: 'Bobbin Table',
    deck: 'CFL',
    number: 17,
    cost: {
      wood: 1,
    },
    desc: [
      'This is an action space only you may use. After using it and until the next harvest begins, you may use occupied action spaces. The starting-player marker can change only once per round.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL017.png',
    playerActionCardType: 'minor',
  },
  impl: cardImpl,
})
