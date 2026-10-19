import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
import { createIsolatedGameSession, workerObservation } from '../game/custom-session-executor'
import { registerExecutorBackedCustomCard } from '../custom-code/runtime'
import { registerBrowserBackedCustomCard } from '../../client/local-sandbox/browser-runtime'
import { SessionCardContext, withSessionContext, type CustomCardData } from '../../shared/cards/session-card-context'

// Persisted manifests bypass source compilation. Reject the whole registration
// before any effects/listeners are installed; never silently translate a phase.
const staleCard = (): CustomCardData => ({
  cardType: 'minor',
  cardJson: { id: 'CUSTOM_StalePhase', name: 'Stale Phase', deck: 'CUSTOM', number: 0, desc: [] },
  compiledCode: 'const CARD_IMPL = {}',
  codeManifest: JSON.parse(JSON.stringify({
    effectHooks: ['onBuy'],
    listeners: [
      { registrationId: 'valid-listener', phases: ['after'] },
      { registrationId: 'stale-listener', phases: ['during'] },
    ],
  })),
})

describe('saved custom-card listener phase admission', () => {
  const error = /CUSTOM_StalePhase.*stale-listener.*unsupported listener phase 'during'/

  it.each([
    {}, { actions: [], phases: ['after'] }, { actions: ['collect'] },
    { actions: ['collect'], phases: 3 }, { actions: ['collect'], phases: null },
    { actions: ['collect'], phases: 'after' },
    ...['store-on-card', 'take-from-card', 'pop-card-stack', 'spend-worker', 'special-effect', 'harvest-feed-conversion', 'selection']
      .map(action => ({ actions: ['collect', action], phases: ['after'] })),
    { actions: ['collect'], phases: ['anytime'] },
    { actions: ['collect'], phases: ['after'], events: ['farm.sown'] },
  ])('rejects the complete saved registration in both executors and session entry: %j', invalid => {
    const data = staleCard()
    data.codeManifest = JSON.parse(JSON.stringify({ effectHooks: ['onBuy'], listeners: [
      { registrationId: 'valid', actions: ['collect'], phases: ['after'] },
      { registrationId: 'invalid', ...invalid },
    ] }))
    for (const register of [registerExecutorBackedCustomCard, registerBrowserBackedCustomCard]) {
      const context = new SessionCardContext()
      expect(() => withSessionContext(context, () => register(data))).toThrow(/listener|Listener/)
      expect(context.customEffects.size).toBe(0)
      expect(context.customListeners).toEqual([])
    }
    expect(() => new GameSession(1063, [data], { playerCount: 2 })).toThrow(/listener|Listener/)
  })

  it.each([
    { runtime: 'server', register: registerExecutorBackedCustomCard },
    { runtime: 'browser', register: registerBrowserBackedCustomCard },
  ])('rejects a saved manifest before partially registering its effects or listeners in $runtime', ({ register }) => {
    const context = new SessionCardContext()
    expect(() => withSessionContext(context, () => register(staleCard()))).toThrow(error)
    expect(context.customEffects.size).toBe(0)
    expect(context.customListeners).toEqual([])
  })

  it('rejects the saved manifest at the session boundary instead of downgrading it to a warning', () => {
    expect(() => new GameSession(1063, [staleCard()], { playerCount: 2 })).toThrow(error)
  })

  it('rejects Room and HTTP session creation before the facade strips executable manifests', () => {
    const workersBefore = workerObservation()
    let created: ReturnType<typeof createIsolatedGameSession> | undefined
    try {
      expect(() => {
        created = createIsolatedGameSession(1063, [staleCard()], { playerCount: 2 })
      }).toThrow(error)
      expect(created).toBeUndefined()
      expect(workerObservation()).toEqual(workersBefore)
    } finally {
      created?.executor?.dispose()
      created?.session.dispose()
    }
  })
})
