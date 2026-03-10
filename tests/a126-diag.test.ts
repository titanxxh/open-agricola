import { describe, expect, it } from 'vitest'
import { GameSession } from '../server/game-session'
import { createInitialState } from '../shared/logic/state'

describe('A126 MasterWorkman integration', () => {
  it('grants 1 wood when using a round-1 action space', () => {
    const state = createInitialState(42)
    const session = new GameSession(state)

    session.devPlayCard(0, 'A126_MasterWorkman')
    const s0 = session.getState()
    const p0 = s0.state.players[0]

    const woodBefore = p0.resources.wood
    const resp = session.takeAction(0, 'sheep-market')
    const woodAfter = resp.state.players[0].resources.wood
    console.log('Wood before:', woodBefore, 'Wood after:', woodAfter)
    console.log('Pending:', resp.pending.type)
    console.log('Log:', JSON.stringify(resp.state.log.slice(0, 5), null, 2))

    expect(woodAfter).toBeGreaterThan(woodBefore)

    const cardGainLog = resp.state.log.find(
      (e: any) => e.key === 'log.cardEffectGain'
    )
    expect(cardGainLog).toBeTruthy()
    expect(cardGainLog.params.cardId).toBe('A126_MasterWorkman')
    expect(cardGainLog.params.gain).toEqual({ wood: 1 })

    const actionDetailLog = resp.state.log.find(
      (e: any) => e.key === 'log.actionDetail'
    )
    if (actionDetailLog) {
      const gains = actionDetailLog.params?.detailParts?.gains ?? {}
      expect(gains.wood ?? 0).toBe(0)
    }
  })
})
