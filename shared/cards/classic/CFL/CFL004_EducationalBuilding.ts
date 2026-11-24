import { futureMeeplesNode } from '../../../actions/effects/internal/future-meeples'
import { declaresPlacementPerson } from '../../../actions/helpers/placement-person'
import type { ActionHookResult } from '../../../actions/hooks'
import type { PlayerState } from '../../../contract/types'
import { createEventQuery } from '../../../events/query'
import { selectWorkerForMoorAction } from '../../../moor/heating'
import { definePlayerActionCard } from '../../card-source'
import { readActionSnapshotExtraData } from '../../helpers/action-snapshot'
import { readCardExtraData, writeCardExtraData } from '../../helpers/card-state'
import { getRoundPersonPlacementDetails } from '../../helpers/round-placement'
import { createPlayerActionSpaces, definePlayerActionSpaceFlow, registerPlayerActionSpace } from '../../player-action-space'

const CARD_ID = 'CFL004_EducationalBuilding'
const workedKey = (workerId: string) => `worked-${workerId}`
const isThirdOrFourth = (player: PlayerState, workerId: string | undefined) =>
  player.workers.slice(2, 4).some(worker => worker.id === workerId && worker.isActive)

const rememberPlacement = (player: PlayerState, workerId?: string): ActionHookResult | undefined => {
  if (!workerId || !isThirdOrFourth(player, workerId) || readCardExtraData(player, CARD_ID, workedKey(workerId))) return
  return {
    countCardUse: false,
    flow: {
      type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID,
      params: { kind: 'set-extra-data', key: workedKey(workerId), value: true },
    },
  }
}

registerPlayerActionSpace({
  cardId: CARD_ID,
  access: 'owner',
  createDefinition: ownerId => definePlayerActionSpaceFlow({
    id: CARD_ID,
    nameKey: `cards.${CARD_ID}.name`,
    descriptionKey: 'actions.future-meeples.description',
    canBeExecutedByPlayer: (state, player, context) => {
      if (player.id !== ownerId || context?.actionContext?.viaCardJump || declaresPlacementPerson(context?.actionContext)) return false
      const placed = readActionSnapshotExtraData<string>(player, 'placedWorkerId')
      const here = state.actionSpaces.find(space => space.id === CARD_ID)
      const current = here?.takenBy.find(ref => ref.playerId === ownerId && ref.workerId === placed && !ref.synthetic)
      const workerId = current?.workerId ?? selectWorkerForMoorAction(state, player, CARD_ID)?.id
      if (!workerId || !isThirdOrFourth(player, workerId) || readCardExtraData(player, CARD_ID, workedKey(workerId))) return false
      // A recalled person may act again before the first space's after listeners have resolved.
      const placements = getRoundPersonPlacementDetails(player).filter(entry => entry.workerId === workerId)
      return placements.length === 0 || (!!current && placements.length === 1 && placements[0]!.spaceId === CARD_ID)
    },
    flowFactory: ({ state, player }) => ({
      ...futureMeeplesNode({
        cardId: CARD_ID,
        playerId: player.id,
        entries: Array.from({ length: 14 - state.round }, (_, i) => ({
          round: state.round + i + 1,
          resources: i % 2 === 0 ? { wood: 1 } : { stone: 1 },
        })),
      }),
      sourceCard: CARD_ID,
    }),
  }),
})

export const CFL004_EducationalBuilding = definePlayerActionCard({
  meta: {
    id: CARD_ID, name: 'Educational Building', deck: 'CFL', number: 4,
    playerActionCardType: 'minor',
    artUrl: 'assets/classic/CFL/CFL004.png',
    cost: { clay: 2, reed: 1 },
    desc: ['This card is an additional action space for you only. The first time you send your third or fourth family member to work, you may place that person here. Put alternating <WOOD> and <STONE>, starting with <WOOD>, on each remaining round space. At the start of those rounds, you receive the resource.'],
  },
  impl: {
    listeners: [
      {
        id: `${CARD_ID}-new-person-only`, cardIds: [CARD_ID], actionSpaces: [CARD_ID], phases: ['isDoable'],
        handler: ({ actionSpaceUse }) => actionSpaceUse?.newPlacement === false ? { doable: false } : undefined,
      },
      {
        id: `${CARD_ID}-first-placement`, cardIds: [CARD_ID], zones: ['hand', 'played'],
        actionSpaces: 'all', phases: ['after'], requiresNewPlacement: true, mandatory: true,
        handler: ({ player, actionSpaceUse }) => rememberPlacement(player, actionSpaceUse?.personUse?.workerId),
      },
      {
        id: `${CARD_ID}-card-person`, cardIds: [CARD_ID], zones: ['hand', 'played'],
        events: ['worker.useCompleted'], phases: ['after'], mandatory: true,
        handler: ({ player, actionEvents }) => rememberPlacement(player, createEventQuery(actionEvents ?? []).find('worker.useCompleted')?.workerId),
      },
    ],
    effect: {
      id: CARD_ID,
      onBuy: (state, player) => {
        // A card drawn mid-game missed placements while it was in the deck.
        for (const event of state.events) {
          if (event.actorPlayerId !== player.id) continue
          if (event.type === 'worker.placed' && event.sourceActionId === 'family-growth' && isThirdOrFourth(player, event.workerId)) {
            writeCardExtraData(player, CARD_ID, workedKey(event.workerId), false)
            continue
          }
          const workerId = event.type === 'actionSpace.useStarted' && event.newPlacement
            ? event.personUse?.workerId : event.type === 'worker.useCompleted' ? event.workerId : undefined
          if (workerId && isThirdOrFourth(player, workerId)) writeCardExtraData(player, CARD_ID, workedKey(workerId), true)
        }
        const space = createPlayerActionSpaces(state).find(entry => entry.id === CARD_ID)
        if (space && !state.actionSpaces.some(entry => entry.id === CARD_ID)) state.actionSpaces.push(space)
      },
    },
  },
})
