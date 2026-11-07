import { describe, expect, it } from 'vitest'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'
import { firstDraftPick } from '../../shared/draft/__tests__/draft-fixtures'

describe('PlayerStats draft tracking', () => {
  it('records each pick with draftTurn for occ + minor', () => {
    const session = createOpeningSession({ seed: 123456,
      options: { playerCount: 2, draftMode: 'simultaneous', draftPoolSize: 7 },
      expected: { phase: 'draft', roundPhase: 'work', interaction: { stateId: 'idle' } },
    })
    const draft = session.getState().state.draft!
    const p1Pick = firstDraftPick(draft, 'p1')
    const p2Pick = firstDraftPick(draft, 'p2')

    let resp = session.submitDraftPick('p1', p1Pick)
    expect(resp.ok).toBe(true)
    resp = session.submitDraftPick('p2', p2Pick)
    expect(resp.ok).toBe(true)

    const after = session.getState().state.players[0]!
    expect(after.stats.draftHistory.length).toBe(2)
    expect(after.stats.draftHistory).toEqual(
      expect.arrayContaining([
        { cardId: p1Pick.occCardId, draftTurn: 1 },
        { cardId: p1Pick.minorCardId, draftTurn: 1 },
      ]),
    )

    const p2 = session.getState().state.players[1]!
    expect(p2.stats.draftHistory).toEqual(
      expect.arrayContaining([
        { cardId: p2Pick.occCardId, draftTurn: 1 },
        { cardId: p2Pick.minorCardId, draftTurn: 1 },
      ]),
    )
  })

  it('recordDraftPlayed sets playedTurn on the original draft entry when occupation is played', async () => {
    const { recordDraftPick, recordDraftPlayed } = await import('../../shared/session/stats')
    const session = createWorkSession()
    const player = session.state.players[0]
    recordDraftPick(player, 'A29', 1)
    recordDraftPlayed(player, 'A29', 5)
    expect(player.stats.draftHistory[0]!.playedTurn).toBe(5)
    session.dispose()
  })
})
