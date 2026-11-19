import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData } from '../../helpers/card-state'
import { getOwnOrdinaryFenceReserveCount } from '../../../domain/supply-tokens'
import type { PlayerState, ActionFlow } from '../../../contract/types'
import { gainLeaf } from '../../helpers/pay-gain-node'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CFL060_VirtuousHero'

const recipients = (player: PlayerState) =>
  readCardExtraData<string[]>(player, CARD_ID, 'fenceRecipients') ?? []
const mark = (ids: string[]): ActionFlow => ({
  type: 'leaf',
  actionId: 'special-effect',
  sourceCard: CARD_ID,
  params: { kind: 'set-extra-data', key: 'fenceRecipients', value: ids },
})

const cardImpl = {
  effect: {
    id: CARD_ID,
    getRuleContributions: (player) => ({ reservedSupply: { fence: recipients(player).length } }),
    getStatePresentation: (player) => ({
      publicCardMarkers: recipients(player).map((recipient) => ({
        id: `${CARD_ID}:${recipient}`,
        label: 'Fence',
        labelKey: 'resources.fence',
        sourceCardId: CARD_ID,
        sourcePlayerId: recipient,
      })),
    }),
  },
  listeners: [
    {
      id: CARD_ID + '-give-fences',
      cardIds: [CARD_ID],
      actions: ['anytime'],
      phases: ['anytime'],
      handler: ({ state, player }) =>
        recipients(player).length === 0 &&
        state.players.length > 1 &&
        getOwnOrdinaryFenceReserveCount(player) >= state.players.length - 1
          ? {
              flow: mark(
                state.players.filter((other) => other.id !== player.id).map((other) => other.id),
              ),
            }
          : undefined,
    },
    {
      id: CARD_ID + '-retrieve-fence',
      cardIds: [CARD_ID],
      actions: ['collect'],
      phases: ['after'],
      scope: 'opponent',
      handler: (context) => {
        const owner = context.ownerPlayer
        const actor = context.triggerPlayer ?? context.player
        if (!owner || !recipients(owner).includes(actor.id)) return
        const resources = new Set(
          createEventQuery(context.ownActionEvents ?? context.actionEvents ?? [])
            .filter('resource.moved')
            .filter(
              (event) =>
                event.from.kind === 'actionSpace' &&
                event.to.kind === 'player' &&
                event.to.playerId === actor.id,
            )
            .flatMap((event) =>
              Object.entries(event.resources)
                .filter(([key, count]) => key !== 'food' && key !== 'begging' && (count ?? 0) > 0)
                .map(([key]) => key),
            ),
        )
        if (!resources.size) return
        return {
          flow: {
            type: 'xor',
            optional: true,
            children: [...resources].map((resource) => ({
              type: 'seq',
              children: [
                mark(recipients(owner).filter((id) => id !== actor.id)),
                gainLeaf(CARD_ID, { food: 1 }),
                {
                  type: 'leaf',
                  actionId: 'gain',
                  sourceCard: CARD_ID,
                  params: { [resource]: 1, recipientPlayerId: actor.id },
                },
              ],
            })),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CFL060_VirtuousHero = defineOccupationCard({
  meta: {
    id: 'CFL060_VirtuousHero',
    name: 'Virtuous Hero',
    deck: 'CFL',
    number: 60,
    players: '3+',
    desc: [
      'If no opponent holds one of your fences, you may give each opponent a fence from your supply. When an opponent holding one takes a non-food resource from an accumulation space, you may retrieve it to get 1 <FOOD>; that player gets 1 additional resource of the collected type.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL060.png',
  },
  impl: cardImpl,
})
