import { afterEach, describe, expect, it } from 'vitest'
import type { GameSession, SessionResponse } from '../game/authoritative-session'
import { createOpeningSession, createWorkSession } from './_helpers/session-fixtures'

const sessions: GameSession[] = []
afterEach(() => sessions.splice(0).forEach(session => session.dispose()))

describe('private opening prompt projection', () => {
  it('withholds hidden hand attribution and prompt keys from opponents and spectators', () => {
    const session = createOpeningSession({ seed: 9, options: { deckIds: ['E'] },
      expected: { phase: 'playing', roundPhase: 'preparation', interaction: { stateId: 'wait', kind: 'choice', playerIndex: 1 } } })
    sessions.push(session)
    const response = session.getState()
    expect(response.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'E096_Elder' })
    const namedPrompt = { ...response, interaction: { ...response.interaction, promptKey: 'cards.E096_Elder.privateOffer' } }
    for (const visible of [[], ['p1']]) {
      const payload = session.buildSyncPayload(namedPrompt, visible)
      expect(payload.interaction).toMatchObject({ stateId: 'wait', playerIndex: 1, request: { kind: 'private-prompt' } })
      expect(payload.interaction).not.toHaveProperty('sourceCard')
      expect(payload.interaction).not.toHaveProperty('promptKey')
      expect(payload.interaction.stateId === 'wait' ? payload.interaction.request : {}).not.toHaveProperty('sourceCard')
      expect(payload.interaction.stateId === 'wait' ? payload.interaction.request : {}).not.toHaveProperty('promptKey')
      expect(JSON.stringify(payload)).not.toContain('E096_Elder')
    }
    for (const visible of [['p2'], ['p1', 'p2']]) {
      const projected = session.buildSyncPayload(namedPrompt, visible).interaction
      expect(projected).toMatchObject({ stateId: 'wait', sourceCard: 'E096_Elder', promptKey: 'cards.E096_Elder.privateOffer',
        request: { kind: 'choice' } })
      expect(projected).toEqual(namedPrompt.interaction)
    }
    expect(session.state.players[1]!.occupationHand).toContain('E096_Elder')
    expect(session.state.players[1]!.occupationPlayed).not.toContain('E096_Elder')
  })

  it('keeps attribution for an already public played source without revealing its private choices', () => {
    const session = createWorkSession({ configure: state => { state.players[0]!.occupationPlayed = ['A086_AnimalTamer'] } })
    sessions.push(session)
    const response: SessionResponse = { ...session.getState(), interaction: {
      stateId: 'wait', playerIndex: 0, sourceCard: 'A086_AnimalTamer', promptKey: 'ui.publicCardPrompt',
      request: { kind: 'choice', options: [{ value: 'private-choice', labelKey: 'ui.interactionConfirm' }] },
      allowedCommands: ['resolveChoice'], anytimeActions: [],
    } }
    const payload = session.buildSyncPayload(response, [])
    expect(payload.interaction).toMatchObject({ stateId: 'wait', sourceCard: 'A086_AnimalTamer', promptKey: 'ui.publicCardPrompt',
      request: { kind: 'private-prompt', sourceCard: 'A086_AnimalTamer', promptKey: 'ui.publicCardPrompt' } })
    expect(JSON.stringify(payload.interaction)).not.toContain('private-choice')
  })
})
