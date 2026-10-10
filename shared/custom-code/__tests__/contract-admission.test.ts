import { describe, expect, it } from 'vitest'
import { assertCustomEffectResult, normalizeCustomManifest, type RawCustomManifest } from '../contract-admission'
import { sandboxListenerActions } from '../sandbox-listener-actions'
import { sandboxListenerPhases } from '../sandbox-listener-phases'

const CARD_ID = 'CUSTOM_Admission'
const manifest = (overrides: Partial<RawCustomManifest>): RawCustomManifest => ({ effectKeys: [], listeners: [], ...overrides })
const listener = (fields: Partial<RawCustomManifest['listeners'][number]>) =>
  manifest({ listeners: [{ registrationId: `${CARD_ID}:listener:0`, ...fields }] })

describe('normalizeCustomManifest', () => {
  it('keeps declared contract values', () => {
    expect(normalizeCustomManifest({
      effectKeys: ['onRoundStart'],
      effectMetadata: { handHooks: ['onRoundStart'] },
      listeners: [{ registrationId: `${CARD_ID}:listener:0`, cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], scope: 'any' }],
    }, CARD_ID)).toEqual({
      effectHooks: ['onRoundStart'],
      effectMetadata: { handHooks: ['onRoundStart'] },
      listeners: [{ registrationId: `${CARD_ID}:listener:0`, cardIds: [CARD_ID], actions: ['collect'], phases: ['after'], scope: 'any' }],
    })
  })

  it('binds a listener to its own card and omitted filters to the deployed sets', () => {
    const [bound] = normalizeCustomManifest(listener({}), CARD_ID).listeners
    expect(bound!.cardIds).toEqual([CARD_ID])
    expect(bound!.phases).toEqual([...sandboxListenerPhases])
    expect(bound!.actions).toEqual([...sandboxListenerActions, 'anytime'])
    expect(normalizeCustomManifest(listener({ phases: ['after'] }), CARD_ID).listeners[0]!.actions)
      .toEqual([...sandboxListenerActions])
    expect(normalizeCustomManifest(listener({ phases: ['anytime'] }), CARD_ID).listeners[0]!.actions)
      .toContain('anytime')
  })

  it.each([
    [manifest({ effectKeys: ['onSowExtraField'] }), "effect hook 'onSowExtraField'"],
    [manifest({ effectKeys: ['onBuy'], effectMetadata: { handHooks: ['onBuy'] } }), "hand hook 'onBuy'"],
    [listener({ actions: ['forest'] }), "listener action 'forest'"],
    [listener({ phases: ['computeExchanges'] }), "listener phase 'computeExchanges'"],
    [listener({ scope: 'everyone' }), "listener scope 'everyone'"],
  ])('rejects a declaration outside the contract', (raw, detail) => {
    expect(() => normalizeCustomManifest(raw, CARD_ID)).toThrow(`${detail} is not in the Workshop Capability Contract`)
  })

  it('rejects listeners bound to another card', () => {
    expect(() => normalizeCustomManifest(listener({ cardIds: ['E033_BeaverColony'] }), CARD_ID))
      .toThrow('listener cardIds must be [CARD_ID]')
    expect(() => normalizeCustomManifest(listener({ cardIds: [CARD_ID, 'E033_BeaverColony'] }), CARD_ID))
      .toThrow('listener cardIds must be [CARD_ID]')
  })
})

describe('assertCustomEffectResult', () => {
  it.each(['onBuy', 'onRoundStart', 'resolveChoice', 'contributeExtraTurn'])('checks the flow returned by %s', (hook) => {
    expect(() => assertCustomEffectResult(hook, { type: 'leaf', actionId: 'gain', params: { food: 1 } }, CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult(hook, { type: 'leaf', actionId: 'plow' }, CARD_ID))
      .toThrow(`${hook}: actionId 'plow' is not in the Workshop Capability Contract`)
    expect(() => assertCustomEffectResult(hook, { type: 'leaf', actionId: 'gain', sourceCard: 'A001_Other' }, CARD_ID))
      .toThrow(`${hook}: sourceCard must be this card's id`)
  })

  it('leaves query hook results to their native consumers', () => {
    expect(() => assertCustomEffectResult('computeBonusScore', 3, CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult('onBeforePlayerTurn', { skipTurn: true }, CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult('onComputeAnimalZones', [{ type: 'card' }], CARD_ID)).not.toThrow()
  })
})
