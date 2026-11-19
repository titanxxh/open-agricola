import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { reserveSupplyWorker, releaseSupplyWorker } from '../../../domain/supply-workers'
import { registerAdHocAction } from '../../../actions/helpers/ad-hoc-action-registry'

const CARD_ID = 'CWM019_FamilyPlanner'

const RELEASE = 'card_' + CARD_ID + '_release'
registerAdHocAction({
  id: RELEASE,
  nameKey: 'actions.family-growth.name',
  descriptionKey: 'actions.family-growth.description',
  roundAvailable: 1,
  gainPerRound: {},
  canBeExecutedByPlayer: () => true,
  execute: ({ state, player }) => {
    const schedule =
      readCardExtraData<{ round: number; workerId: string }[]>(player, CARD_ID, 'schedule') ?? []
    for (const entry of schedule.filter((entry) => entry.round <= state.round)) {
      const worker = player.workers.find(
        (w) => w.id === entry.workerId && w.supplyUse?.sourceCard === CARD_ID,
      )
      if (worker) releaseSupplyWorker(state, player, worker)
    }
    writeCardExtraData(
      player,
      CARD_ID,
      'schedule',
      schedule.filter((entry) => entry.round > state.round),
    )
    return {
      type: 'flow',
      flow: { type: 'leaf', actionId: 'family-growth', sourceCard: CARD_ID, optional: true },
    }
  },
})
const cardImpl = {
  effect: {
    id: CARD_ID,
    onBuy: (state, player) => {
      const schedule: { round: number; workerId: string }[] = []
      for (const offset of [4, 7, 10]) {
        if (state.round + offset > 14) continue
        const worker = reserveSupplyWorker(player, CARD_ID)
        if (worker) schedule.push({ round: state.round + offset, workerId: worker.id })
      }
      writeCardExtraData(player, CARD_ID, 'schedule', schedule)
    },
    onRoundStart: (state, player) => {
      const schedule =
        readCardExtraData<{ round: number; workerId: string }[]>(player, CARD_ID, 'schedule') ?? []
      const due = schedule.filter((entry) => entry.round <= state.round)
      if (!due.length) return
      return { type: 'leaf', actionId: RELEASE, sourceCard: CARD_ID }
    },
    getStatePresentation: (player) => ({
      counters: {
        reserved: (readCardExtraData<unknown[]>(player, CARD_ID, 'schedule') ?? []).length,
      },
    }),
  },
} satisfies CardImpl

export const CWM019_FamilyPlanner = defineOccupationCard({
  meta: {
    id: 'CWM019_FamilyPlanner',
    name: "Family Planner",
    deck: 'CWM',
    number: 19,
    desc: ["Add 4, 7, and 10 to the current round. Place one family member from your supply on each corresponding round space. At the start of those rounds, return that member to your supply and you may take a Family Growth with Room action."],
    cost: {},
    vp: 0,
    prerequisite: "",
    players: '1+',
    passing: false,
    extraVp: false,
    implemented: true,
    artUrl: '/assets/classic/CWM/CWM019.png',
  },
  impl: cardImpl,
})

export const CWM019_FamilyPlanner_impl = CWM019_FamilyPlanner.impl
