import type { GameSession, SessionResponse } from '../../game/authoritative-session'
import { requireActiveCardRegistry } from '../../../shared/cards/active-registry'
import type { CardListenerRegistration } from '../../../shared/cards/card-listeners'
import type { ActionFlow, Resource } from '../../../shared/contract/types'

export const SPACE_PROBES = ['TEST_SpaceBefore', 'TEST_SpaceImmediate', 'TEST_SpaceAfter'] as const

export function probeReward(card: string, resources: Partial<Resource>, optional = false): ActionFlow {
  return { type: 'seq', optional, sourceCard: card, children: [
    { type: 'leaf', actionId: 'gain', sourceCard: card, params: resources },
    { type: 'leaf', actionId: 'special-effect', sourceCard: card,
      params: { kind: 'increment-counter', key: 'count', amount: 1 } },
  ] }
}

export function installSpaceProbes(session: GameSession, {
  selector = ['forest'], optionalImmediate = false,
}: { selector?: 'all' | string[]; optionalImmediate?: boolean } = {}): void {
  const phases = ['before', 'immediatelyAfter', 'after'] as const
  const resources = [{ wood: 1 }, { clay: 1 }, { stone: 1 }]
  session.withCtx(() => {
    for (const [index, card] of SPACE_PROBES.entries()) {
      const listener: CardListenerRegistration = {
        id: `${card}:use`, cardIds: [card], actionSpaces: selector, phases: [phases[index]!],
        mandatory: true,
        handler: () => ({ sourceCard: card, flow: probeReward(card, resources[index]!, index === 1 && optionalImmediate) }),
      }
      requireActiveCardRegistry('space-use-probes').registerListener(listener)
    }
  })
}

export function spaceProbeCounts(response: SessionResponse): number[] {
  return SPACE_PROBES.map(card => response.state.players[0]!.cardStates?.[card]?.counters?.count ?? 0)
}
