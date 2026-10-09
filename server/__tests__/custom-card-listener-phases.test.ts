import { describe, expect, it } from 'vitest'
import { GameSession } from '../game/authoritative-session'
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
})
