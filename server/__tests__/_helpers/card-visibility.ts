import { GameSession } from '../../game/authoritative-session'
import { defineMinorCard } from '../../../shared/cards/card-source'
import { getActiveCardRegistry } from '../../../shared/cards/active-registry'
import type { CardImpl } from '../../../shared/cards/registry'

export const CARD_ID = 'CUSTOM_VisibilitySource'
const INTERNAL = 'INTERNAL_CARD_SENTINEL'
const PRIVATE = 'OWNER_CARD_SECRET'
const STACK = 'INTERNAL_STACK_SENTINEL'

export const visibilitySource = defineMinorCard({
  meta: { id: CARD_ID, name: 'Visibility Source', deck: 'CUSTOM', number: 0, desc: [] },
  presentation: { counters: ['visibleCount'] },
  impl: { effect: {
    id: CARD_ID,
    getStatePresentation: () => ({ resourceGroups: [{ wood: 1, clay: 1 }] }),
    onEndTurn: (_state, player) => player.cardStates[CARD_ID]?.extraData?.written ? undefined : ({
      type: 'seq', children: [
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: 'internal', value: INTERNAL } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-private-data', key: 'secret', value: PRIVATE } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-counter', key: 'internalCounter', value: 8675912 } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-infobox', text: 'Updated public display' } },
        { type: 'leaf', actionId: 'special-effect', sourceCard: CARD_ID, params: { kind: 'set-extra-data', key: 'written', value: true } },
        { type: 'leaf', actionId: 'gain', sourceCard: CARD_ID, params: { food: 1 } },
      ],
    }),
  } } satisfies CardImpl,
})
export const prepareVisibilitySession = (session: GameSession) => {
  session.withCtx(() => getActiveCardRegistry()!.loadImpl(CARD_ID, visibilitySource.impl))
  for (const player of session.state.players) {
    player.minorHand = ['__test_placeholder__']
    player.occupationHand = ['__test_placeholder__']
  }
  session.state.players[0]!.minorPlayed = [CARD_ID]
  session.state.players[0]!.cardStates[CARD_ID] = {
    flagged: true, counters: { internalCounter: 8675912, visibleCount: 2 },
    extraData: { internal: INTERNAL }, privateData: { secret: PRIVATE }, stack: [STACK], infobox: 'Public display',
  }
  return session
}

export const createVisibilitySession = () => prepareVisibilitySession(new GameSession(42, undefined, { playerCount: 2 }))
