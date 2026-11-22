import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { payGainFlow } from '../../helpers/pay-gain-node'
import { reserveSupplyWorker, releaseSupplyWorker } from '../../../domain/supply-workers'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CWM033_LadyinWaiting'

const JOIN = 'card_' + CARD_ID + '_join'
registerAdHocAction({
  id: JOIN,
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: (_state, player) =>
    player.workers.some(
      (w) => w.supplyUse?.sourceCard === CARD_ID && w.supplyUse.status === 'reserved',
    ),
  execute: ({ player, eventSink }) => {
    const worker = player.workers.find(
      (w) => w.supplyUse?.sourceCard === CARD_ID && w.supplyUse.status === 'reserved',
    )
    if (!worker) return { type: 'fail', errorKey: 'log.familyFull' }
    delete worker.supplyUse
    worker.isActive = true
    worker.isNewborn = false
    eventSink?.emit<'worker.placed'>({
      type: 'worker.placed',
      workerId: worker.id,
      spaceId: 'home',
      viaCardId: CARD_ID,
    })
    return { type: 'ok' }
  },
})
const RELEASE = 'card_' + CARD_ID + '_release'
registerAdHocAction({
  id: RELEASE,
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    for (const worker of player.workers.filter(
      (w) => w.supplyUse?.sourceCard === CARD_ID && w.supplyUse.status === 'reserved',
    ))
      releaseSupplyWorker(state, player, worker)
    return { type: 'ok' }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      if (state.round <= 4) reserveSupplyWorker(player, CARD_ID)
    },
    onRoundStart: (state, player) => {
      const worker = player.workers.find(
        (w) => w.supplyUse?.sourceCard === CARD_ID && w.supplyUse.status === 'reserved',
      )
      if (!worker) return
      if (state.round > 12) return { type: 'leaf', actionId: RELEASE, sourceCard: CARD_ID }
      return state.round === 12
        ? payGainFlow({
            cardId: CARD_ID,
            cost: { food: 2 },
            followUp: [{ type: 'leaf', actionId: JOIN, sourceCard: CARD_ID }],
          })
        : undefined
    },
    getStatePresentation: (player) => ({
      heldWorkerId: player.workers.find((w) => w.supplyUse?.sourceCard === CARD_ID)?.id,
    }),
  },
} satisfies CardImpl

export const CWM033_LadyinWaiting = defineOccupationCard({
  meta: {
    id: 'CWM033_LadyinWaiting',
    name: "Lady in Waiting",
    deck: 'CWM',
    number: 33,
    desc: ["If you play this card during stage 1, place a family member from your supply on round 12. At the start of round 12, you may pay 2 <FOOD> to bring that person into play without needing room. The person can work that round."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '3+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM033.png',
  },
  impl: cardImpl,
})

export const CWM033_LadyinWaiting_impl = CWM033_LadyinWaiting.impl
