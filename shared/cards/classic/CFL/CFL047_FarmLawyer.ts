import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { cardEffectHandChangedEvent } from '../../../session/private-hand-events'

const CARD_ID = 'CFL047_FarmLawyer'

const TRANSFER = 'card_CFL047_FarmLawyer_transfer'
registerAdHocAction({
  id: TRANSFER,
  nameKey: `cards.${CARD_ID}.name`,
  descriptionKey: `cards.${CARD_ID}.name`,
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (state, player) =>
    state.players.some(
      (other) => other.id !== player.id && other.resources.food > player.resources.food,
    ) && state.ordinaryCardDecks.occupation.length > 0,
  execute: ({ state, player }) => {
    const options = state.players
      .filter((other) => other.id !== player.id && other.resources.food > player.resources.food)
      .map((other) => ({
        value: other.id,
        labelKey: 'ui.interactionSelection',
        descriptionPreview: {
          kind: 'action' as const,
          labelKey: 'actions.gain.name',
          actor: {
            playerId: other.id,
            name: other.name,
            nameIsDefault: other.nameIsDefault ?? false,
            index: state.players.indexOf(other),
          },
          effectPreview: {
            kind: 'resourceExchange' as const,
            resourcesGained: { food: other.resources.food - player.resources.food },
          },
        },
      }))
    if (!options.length || !state.ordinaryCardDecks.occupation.length) return { type: 'ok' }
    return {
      type: 'request',
      promptKey: 'ui.interactionFlowSelect',
      request: { kind: 'choice', options },
    }
  },
  resolveChoice: ({ state, player, emitPrivateEvent }, choice) => {
    const other = state.players.find(
      (other) =>
        other.id === choice &&
        other.id !== player.id &&
        other.resources.food > player.resources.food,
    )
    if (
      !other ||
      !player.occupationPlayed.includes(CARD_ID) ||
      !state.ordinaryCardDecks.occupation.length
    )
      return { type: 'fail', errorKey: 'log.actionFail' }
    const food = other.resources.food - player.resources.food
    player.occupationPlayed = player.occupationPlayed.filter((id) => id !== CARD_ID)
    other.occupationHand.push(CARD_ID)
    emitPrivateEvent?.(
      cardEffectHandChangedEvent(
        other.id,
        [...other.occupationHand],
        'occupation',
        CARD_ID,
        TRANSFER,
      ),
    )
    // extraData is server-only. Even the owner must not learn the face-down identity.
    const hidden = [
      ...(readCardExtraData<string[]>(player, CARD_ID, 'faceDownOccupations') ?? []),
      state.ordinaryCardDecks.occupation.shift()!,
    ]
    writeCardExtraData(player, CARD_ID, 'faceDownOccupations', hidden)
    player.extraOccupationsFromCards.push(`${CARD_ID}:faceDown:${hidden.length}`)
    writeCardExtraData(
      player,
      CARD_ID,
      'publicCardMarkers',
      hidden.map((_id, index) => ({
        id: `${CARD_ID}:faceDown:${index + 1}`,
        label: 'Occupation',
        labelKey: 'ui.occupationCards',
        sourceCardId: CARD_ID,
      })),
    )
    return { type: 'flow', flow: gainLeaf(CARD_ID, { food }) }
  },
})

const cardImpl = {
  effect: { id: CARD_ID, onBuy: () => ({ type: 'leaf', actionId: TRANSFER, sourceCard: CARD_ID }) },
} satisfies CardImpl

export const CFL047_FarmLawyer = defineOccupationCard({
  meta: {
    id: 'CFL047_FarmLawyer',
    name: 'Farm Lawyer',
    deck: 'CFL',
    number: 47,
    players: '1+',
    desc: [
      'Immediately choose an opponent who has more <FOOD> than you and gain the difference from the general supply. Pass this occupation to their hand. Draw an occupation face down in front of you; it counts as played but has no effect.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL047.png',
  },
  presentation: { publicCardMarkers: true },
  impl: cardImpl,
})
