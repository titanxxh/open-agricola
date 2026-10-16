import { describe, expect, it, vi } from 'vitest'
import type { ActionChoiceOption } from '../../shared/contract/types'
import type { GameSession, SessionResponse } from '../../server/game/authoritative-session'
import { createScenarioEvidence } from '../../server/__tests__/_helpers/scenario-evidence'
import { createWorkSession } from '../../server/__tests__/_helpers/session-fixtures'
import { resolveTriggerIfPresent } from '../../server/__tests__/_helpers/trigger-select'

const evidence = createScenarioEvidence(import.meta.url)
const sourceCard = 'E127_DiligentFarmer'

function triggerResponse(session: GameSession, option: ActionChoiceOption): SessionResponse {
  const response = session.getState()
  return {
    ...response,
    interaction: {
      ...response.interaction,
      stateId: 'wait',
      playerIndex: 0,
      request: {
        kind: 'select-trigger',
        ownerPlayerId: response.state.players[0]!.id,
        options: [option],
      },
    },
  }
}

describe('trigger selection helper', () => {
  it('rejects a disabled matched trigger before submitting any choice', () => {
    const session = evidence.track(createWorkSession())
    const response = triggerResponse(session, {
      value: 'opaque-trigger', labelKey: 'ui.yes', sourceCard, disabled: true,
    })
    const resolve = vi.spyOn(session, 'resolveChoice').mockReturnValue({
      ...response, ok: false, error: 'disabled trigger rejected',
    })
    expect(() => resolveTriggerIfPresent(session, response, sourceCard)).toThrow()
    expect(resolve).not.toHaveBeenCalled()
  })

  it.each([false, undefined])('submits an enabled trigger with disabled=%s', (disabled) => {
    const session = evidence.track(createWorkSession())
    const response = triggerResponse(session, {
      value: 'opaque-trigger', labelKey: 'ui.yes', sourceCard, disabled,
    })
    const result = session.getState()
    const resolve = vi.spyOn(session, 'resolveChoice').mockReturnValue(result)
    expect(resolveTriggerIfPresent(session, response, sourceCard)).toBe(result)
    expect(resolve).toHaveBeenCalledExactlyOnceWith(0, 'opaque-trigger')
  })

  it('leaves an idle response unchanged', () => {
    const session = evidence.track(createWorkSession())
    const response = session.getState()
    const resolve = vi.spyOn(session, 'resolveChoice')
    expect(resolveTriggerIfPresent(session, response, sourceCard)).toBe(response)
    expect(resolve).not.toHaveBeenCalled()
  })
})
