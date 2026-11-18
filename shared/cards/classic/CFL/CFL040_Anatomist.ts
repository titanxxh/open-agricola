import { defineOccupationCard } from '../../card-source'
import type { CardImpl } from '../../registry'
import { hasLegalPlaceFarmerTargets } from '../../../actions/effects/place-farmer'
import { addTemporaryGuest } from '../../../domain/supply-workers'
import { isCardFlagged } from '../../helpers/card-state'
import type { ActionFlow, GameState, PlayerState } from '../../../contract/types'

const CARD_ID = 'CFL040_Anatomist'

const guest = (player: PlayerState) =>
  player.workers.find(
    (worker) =>
      worker.isGuest &&
      worker.supplyUse?.sourceCard === CARD_ID &&
      worker.supplyUse.status === 'reserved',
  )
const accumulationSpaces = (state: GameState) =>
  state.actionSpaces
    .filter((space) => Object.values(space.gainPerRound).some((amount) => (amount ?? 0) > 0))
    .map((space) => space.id)

const cardImpl = {
  effect: {
    id: CARD_ID,
    onRoundStart: (state, player) => {
      if (![7, 10, 13].includes(state.round)) return
      addTemporaryGuest(state, player, CARD_ID, true)
      return {
        type: 'leaf',
        actionId: 'special-effect',
        sourceCard: CARD_ID,
        params: { kind: 'set-flag', flag: false },
      }
    },
    contributeExtraTurn: (state, player) => {
      const worker = guest(player)
      const spaces = accumulationSpaces(state)
      if (!worker || !spaces.length || isCardFlagged(player, CARD_ID)) return
      const use: ActionFlow = {
        type: 'seq',
        choiceLabelKey: 'ui.interactionUseAbility',
        children: [
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            params: { kind: 'set-flag', flag: true },
          },
          {
            type: 'leaf',
            actionId: 'place-farmer',
            sourceCard: CARD_ID,
            actionContext: {
              trueAction: false,
              constraints: spaces,
              workerSource: {
                kind: 'supply',
                disposition: 'remove-from-game',
                workerId: worker.id,
              },
            },
          },
        ],
      }
      return {
        type: 'xor',
        children: [
          use,
          {
            type: 'leaf',
            actionId: 'special-effect',
            sourceCard: CARD_ID,
            choiceLabelKey: 'ui.interactionDecline',
            params: { kind: 'set-flag', flag: true },
          },
        ],
      }
    },
    countExtraTurns: (state, player, context) => {
      const worker = guest(player)
      return worker &&
        !isCardFlagged(player, CARD_ID) &&
        hasLegalPlaceFarmerTargets(state, player, context?.actionHooks, CARD_ID, {
          constraints: accumulationSpaces(state),
          workerSource: { kind: 'supply', disposition: 'remove-from-game', workerId: worker.id },
        })
        ? 1
        : 0
    },
  },
} satisfies CardImpl

export const CFL040_Anatomist = defineOccupationCard({
  meta: {
    id: 'CFL040_Anatomist',
    name: 'Anatomist',
    deck: 'CFL',
    number: 40,
    players: '1+',
    desc: [
      'At the start of rounds 7, 10, and 13, you get a guest for that round. Place this guest after all your other people and only on an accumulation space.',
    ],
    implemented: true,
    artUrl: 'assets/classic/CFL/CFL040.png',
  },
  impl: cardImpl,
})
