import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import type { GameState, PlayerState, Resource, ActionFlow } from '../../../contract/types'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { payGainActionFlow } from '../../helpers/pay-gain-node'
import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'
import { createEventQuery } from '../../../events/query'

const CARD_ID = 'CWM043_ResourceLender'

const kinds = ['wood', 'clay', 'reed', 'stone'] as const
const ORDER = 'card_' + CARD_ID + '_order'
const chooseNext = (_state: GameState, player: PlayerState): ActionFlow | undefined => {
  const remaining = readCardExtraData<Partial<Resource>>(player, CARD_ID, 'remaining') ?? {}
  const round = readCardExtraData<number>(player, CARD_ID, 'nextRound') ?? 15
  const choices = kinds.filter((k) => (remaining[k] ?? 0) > 0)
  if (round > 14 || !choices.length) {
    writeCardExtraData(player, CARD_ID, 'remaining', {})
    return
  }
  return {
    type: 'leaf',
    actionId: 'emit-choice',
    sourceCard: CARD_ID,
    params: {
      requiresExplicitChoice: true,
      options: choices.map((resource) => ({
        value: resource,
        labelKey: `resources.${resource}`,
        effectPreview: {
          kind: 'futureSchedule',
          entries: [{ round, resources: { [resource]: 1 } }],
        },
      })),
    },
  }
}
registerAdHocAction({
  id: ORDER,
  nameKey: 'actions.future-meeples.name',
  descriptionKey: 'actions.future-meeples.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player, params }) => {
    writeCardExtraData(player, CARD_ID, 'remaining', params?.resources)
    writeCardExtraData(player, CARD_ID, 'nextRound', state.round + 1)
    const flow = chooseNext(state, player)
    return flow ? { type: 'flow', flow } : { type: 'ok' }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    resolveChoice: (state, player, choice) => {
      if (!kinds.includes(choice as (typeof kinds)[number])) return
      const kind = choice as (typeof kinds)[number],
        resources = readCardExtraData<Partial<Resource>>(player, CARD_ID, 'remaining') ?? {}
      const round = readCardExtraData<number>(player, CARD_ID, 'nextRound') ?? 15
      if (!(resources[kind]! > 0) || round > 14) return
      writeCardExtraData(player, CARD_ID, 'remaining', {
        ...resources,
        [kind]: resources[kind]! - 1,
      })
      writeCardExtraData(player, CARD_ID, 'nextRound', round + 1)
      const next = chooseNext(state, player)
      return {
        type: 'seq',
        children: [
          futureMeeplesNode({
            cardId: CARD_ID,
            playerId: player.id,
            entries: [{ round, resources: { [kind]: 1 } }],
          }),
          ...(next ? [next] : []),
        ],
      }
    },
  },
  listeners: [
    {
      id: CARD_ID + '-lend',
      cardIds: [CARD_ID],
      actions: ['collect', 'receive', 'exchange'],
      phases: ['after'],
      handler: (context) => {
        if (context.state.round >= 14) return
        const events = createEventQuery(context.actionEvents ?? []).filter('resource.moved')
        const transaction = createEventQuery(context.transactionEvents ?? []).filter(
          'resource.moved',
        )
        const gained: Partial<Resource> = {}
        for (const resource of kinds) {
          const amount = events
            .filter(
              (e) =>
                e.to.kind === 'player' &&
                e.to.playerId === context.player.id &&
                (e.from.kind === 'actionSpace' ||
                  (e.from.kind === 'player' &&
                    transaction.some(
                      (t) => t.from.kind === 'actionSpace' && (t.resources[resource] ?? 0) > 0,
                    ))),
            )
            .reduce((n, e) => n + (e.resources[resource] ?? 0), 0)
          if (amount) gained[resource] = amount
        }
        const bonuses = kinds.filter((k) => (gained[k] ?? 0) > 0)
        if (!bonuses.length) return
        return {
          sourceCard: CARD_ID,
          flow: {
            type: 'xor',
            optional: true,
            children: bonuses.map((resource) => ({
              ...payGainActionFlow({
                cardId: CARD_ID,
                cost: gained,
                followUp: [
                  {
                    type: 'leaf',
                    actionId: ORDER,
                    sourceCard: CARD_ID,
                    params: { resources: { ...gained, [resource]: gained[resource]! + 1 } },
                  },
                ],
              }),
              choiceLabelKey: `resources.${resource}`,
            })),
          },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM043_ResourceLender = defineOccupationCard({
  meta: {
    id: 'CWM043_ResourceLender',
    name: "Resource Lender",
    deck: 'CWM',
    number: 43,
    desc: ["Whenever you receive building resources from an action space, you may add 1 resource of a type received, then distribute all those building resources, in any order, one per remaining round space. At the start of those rounds, you get the corresponding resource."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM043.png',
  },
  impl: cardImpl,
})

export const CWM043_ResourceLender_impl = CWM043_ResourceLender.impl
