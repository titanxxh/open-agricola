import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'

const CARD_ID = 'CWM088_GrainElevator'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) =>
      (player.cardStates[CARD_ID]?.counters?.grain ?? 0) !== state.players.length
        ? { type: 'leaf', actionId: 'store-on-card', sourceCard: CARD_ID, params: { grain: 1 } }
        : undefined,
  },
  listeners: [
    {
      id: CARD_ID + '-grain-seeds',
      cardIds: [CARD_ID],
      actionSpaces: ['grain-seeds'],
      phases: ['after'],
      scope: 'any',
      handler: (context) => {
        const owner = context.ownerPlayer ?? context.player
        const grain = owner.cardStates[CARD_ID]?.counters?.grain ?? 0
        if (grain === 0) return
        return {
          sourceCard: CARD_ID,
          flow:
            owner.id === context.player.id
              ? { type: 'leaf', actionId: 'take-from-card', sourceCard: CARD_ID, params: { grain } }
              : {
                  type: 'leaf',
                  actionId: 'special-effect',
                  sourceCard: CARD_ID,
                  targetPlayerId: owner.id,
                  params: { kind: 'set-counter', key: 'grain', value: 0 },
                },
        }
      },
    },
  ],
} satisfies CardImpl

export const CWM088_GrainElevator = defineMinorCard({
  meta: {
    id: 'CWM088_GrainElevator',
    name: "Grain Elevator",
    deck: 'CWM',
    number: 88,
    desc: ["At the start of each round, add 1 <GRAIN> from the supply unless the number of <GRAIN> on this card equals the player count. When you use __Grain Seeds__, take all <GRAIN> here. When another player uses it, discard all <GRAIN> here."],
    cost: {
      stone: 1,
    },
    vp: 0,
    prerequisite: "",
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM088.png',
  },
  presentation: { counters: ['grain'] },
  impl: cardImpl,
})

export const CWM088_GrainElevator_impl = CWM088_GrainElevator.impl
