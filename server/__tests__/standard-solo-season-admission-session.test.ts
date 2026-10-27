import { describe, expect, it } from 'vitest'
import { createOpeningSession } from './_helpers/session-fixtures'
import { createScenarioEvidence } from './_helpers/scenario-evidence'

const evidence = createScenarioEvidence(import.meta.url)

describe('season actions use the actual participant count', () => {
  it.each([1, 2])('takes Autumn Thanksgiving with %i actual participants', playerCount => {
    const session = evidence.track(createOpeningSession({ seed: 3,
      options: { playerCount, enableThroughTheSeasons: true, deckIds: ['A'] },
      expected: { phase: 'playing', roundPhase: 'work', interaction: { stateId: 'idle' } },
    }))
    expect(session.state.players).toHaveLength(playerCount)
    expect(session.state.throughTheSeasons?.currentSeason).toBe('autumn')
    expect(session.state.players[0]!.resources.vegetable).toBe(0)
    let response = session.takeAction(0, 'season-autumn-thanksgiving')
    expect(response.ok, response.error).toBe(true)
    if (response.interaction.stateId === 'wait' && response.interaction.request.kind === 'choice') {
      const vegetable = response.interaction.request.options.find(option => option.labelKey === 'actions.season-autumn-thanksgiving.option-vegetable')
      if (!vegetable) throw new Error(`Unexpected autumn choice: ${JSON.stringify(response.interaction)}`)
      response = session.resolveChoice(0, vegetable.value)
    }
    expect(response.ok, response.error).toBe(true)
    expect(response.state.players[0]!.resources.vegetable).toBe(1)
    expect(response.state.players[0]!.fields).toEqual([])
    expect(response.state.events.filter(event => event.type === 'harvest.started')).toEqual([])
    expect(response.state.events.filter(event => event.type === 'worker.placed'))
      .toEqual([expect.objectContaining({ actorPlayerId: 'p1', spaceId: 'season-autumn-thanksgiving', workerId: '1' })])
    expect(response.interaction).toMatchObject({ stateId: 'wait', request: {
      kind: 'confirm-next-player', nextPlayerIndex: playerCount === 1 ? 0 : 1,
    } })
  })
})
