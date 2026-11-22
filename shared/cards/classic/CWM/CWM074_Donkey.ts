import { defineMinorCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { positionKey } from '../../../domain/farm'

const CARD_ID = 'CWM074_Donkey'

const cardImpl = {
  prerequisiteCheck: (player) => player.pastures.length > 0,
  effect: {
    id: CARD_ID,
    onBuy: (_state, player) => ({
      type: 'leaf',
      actionId: 'emit-choice',
      sourceCard: CARD_ID,
      params: {
        requiresExplicitChoice: true,
        options: player.pastures.map((pasture, i) => ({
          value: pasture.id,
          labelKey: 'ui.pastureLabel',
          labelParams: { index: i + 1 },
        })),
      },
    }),
    resolveChoice: (_state, player, choice) => {
      const chosen = player.pastures.find((p) => p.id === choice)
      if (!chosen?.tiles[0]) return
      // Pasture IDs are renumbered when fences change; a fenced tile stays in one pasture.
      writeCardExtraData(player, CARD_ID, 'pastureTile', positionKey(chosen.tiles[0]))
      return { type: 'leaf', actionId: 'reorganize', sourceCard: CARD_ID }
    },
    onComputeAnimalZones: (player, zones) => {
      const tile = readCardExtraData<string>(player, CARD_ID, 'pastureTile')
      const pasture = player.pastures.find((p) => p.tiles.some((t) => positionKey(t) === tile))
      if (!pasture) return
      for (const zone of zones)
        if (zone.zoneType === 'pasture' && zone.pastureIndex === player.pastures.indexOf(pasture))
          zone.blocked = true
    },
  },
  listeners: [
    {
      id: CARD_ID + '-plow',
      cardIds: [CARD_ID],
      actionSpaces: ['farmland', 'cultivation'],
      phases: ['before'],
      handler: () => ({
        sourceCard: CARD_ID,
        flow: { type: 'leaf', actionId: 'plow', sourceCard: CARD_ID, optional: true },
      }),
    },
  ],
} satisfies CardImpl

export const CWM074_Donkey = defineMinorCard({
  meta: {
    id: 'CWM074_Donkey',
    name: "Donkey",
    deck: 'CWM',
    number: 74,
    desc: ["One of your pastures can no longer hold animals. Whenever you use __Farmland__ or __Cultivation__, you may plow 1 additional <FIELD>."],
    cost: {},
    vp: 0,
    prerequisite: "1 pasture",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM074.png',
  },
  impl: cardImpl,
})

export const CWM074_Donkey_impl = CWM074_Donkey.impl
