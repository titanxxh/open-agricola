import { expect } from 'vitest'
import type { GameSession } from '../../game/authoritative-session'
import type { CardStatePresentation } from '../../../shared/contract/card-state'
import { serializeState } from '../../../shared/session/serialization'
import { frameForPerspective } from '../../../replay-viewer/src/model'

/** Assert the public goods after a real card transaction in every ordinary and Replay view. */
export const expectPublicCardGoods = (session: GameSession, cardId: string, goods: CardStatePresentation) => {
  const before = JSON.stringify(session.state)
  const response = session.getState()
  for (const viewer of ['p1', 'p2', null]) {
    const player = session.buildSyncPayload(response, viewer).state.players[0]!
    expect(player.cardStatePresentation[cardId]).toMatchObject(goods)
    expect(player.cardStates[cardId]).toBeUndefined()
  }
  const frame = session.withCtx(() => serializeState(session.state, {}))
  for (const perspective of ['p1', 'p2', 'open'] as const) {
    expect(frameForPerspective(frame, perspective).players[0]!.cardStatePresentation[cardId]).toMatchObject(goods)
  }
  expect(JSON.stringify(session.state)).toBe(before)
}
