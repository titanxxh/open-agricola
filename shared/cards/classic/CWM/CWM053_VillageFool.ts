import { playerHasCardCapability } from '../../helpers/card-type'
import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readPrivateCardData, writePrivateCardData, incCounter } from '../../helpers/card-state'

const CARD_ID = 'CWM053_VillageFool'

const cardImpl = {
  effect: {
    id: CARD_ID,
    onRoundStart: (_state, player) => {
      if (playerHasCardCapability(player, 'preventsHandDiscard')) return
      const hand = [...player.occupationHand, ...player.minorHand].filter(
        (id) => id !== '__test_placeholder__',
      )
      if (!hand.length) return
      writePrivateCardData(player, CARD_ID, 'choices', hand)
      return {
        type: 'leaf',
        actionId: 'emit-choice',
        sourceCard: CARD_ID,
        optional: true,
        params: {
          requiresExplicitChoice: true,
          options: hand.map((id, i) => ({ value: 'store:' + i, labelKey: `cards.${id}.name` })),
        },
      }
    },
    resolveChoice: (_state, player, choice, context) => {
      if (!choice.startsWith('store:') || playerHasCardCapability(player, 'preventsHandDiscard'))
        return
      const id = readPrivateCardData<string[]>(player, CARD_ID, 'choices')?.[
        Number(choice.slice(6))
      ]
      if (!id || (!player.occupationHand.includes(id) && !player.minorHand.includes(id))) return
      const stored = readPrivateCardData<string[]>(player, CARD_ID, 'stored') ?? []
      writePrivateCardData(player, CARD_ID, 'stored', [...stored, id])
      player.occupationHand = player.occupationHand.filter((card) => card !== id)
      player.minorHand = player.minorHand.filter((card) => card !== id)
      incCounter(player, CARD_ID, 'cards', 1)
      context?.emitPrivateEvent?.({
        schemaVersion: 1,
        type: 'private.handChanged',
        recipientPlayerId: player.id,
        cardIds: [id],
        cardType: 'mixed',
        reason: 'card-effect',
        sourceCard: CARD_ID,
      })
    },
    computeBonusScore: (_state, player) => {
      const count = player.cardStates[CARD_ID]?.counters?.cards ?? 0
      return count - [3, 5, 7, 9].filter((n) => n <= count).length
    },
    getStatePresentation: (player) => ({
      counters: { cards: player.cardStates[CARD_ID]?.counters?.cards ?? 0 },
    }),
  },
} satisfies CardImpl

export const CWM053_VillageFool = defineOccupationCard({
  meta: {
    id: 'CWM053_VillageFool',
    name: "Village Fool",
    deck: 'CWM',
    number: 53,
    desc: ["At the start of each round, you may place one hand card face down under this card; it cannot be used again. At the end of the game, each card under this one scores 1 bonus <SCORE>, except the third, fifth, seventh, and ninth cards."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '4+',
    passing: false,
    extraVp: true,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM053.png',
  },
  impl: cardImpl,
})

export const CWM053_VillageFool_impl = CWM053_VillageFool.impl
