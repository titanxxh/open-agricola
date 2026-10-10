import { describe, expect, it } from 'vitest'
import { cardEffectHooks } from '../../cards/card-effects'
import {
  assertCustomEffectResult, extraHookArguments, isFlowResultHook, normalizeCustomManifest, QUERY_HOOK_RESULT_KINDS,
  registeredEffectMetadata, registeredListenerData, type RawCustomManifest,
} from '../contract-admission'
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
    // The two query phases are dispatched under their own identity, which no card writes.
    expect(bound!.actions).toEqual([...sandboxListenerActions, 'anytime', 'compute-exchanges'])
    expect(normalizeCustomManifest(listener({ phases: ['after'] }), CARD_ID).listeners[0]!.actions)
      .toEqual([...sandboxListenerActions])
    expect(normalizeCustomManifest(listener({ phases: ['anytime'] }), CARD_ID).listeners[0]!.actions)
      .toEqual([...sandboxListenerActions, 'anytime'])
    expect(normalizeCustomManifest(listener({ phases: ['computeExchanges'] }), CARD_ID).listeners[0]!.actions)
      .toEqual([...sandboxListenerActions, 'compute-exchanges'])
  })

  it.each([
    [manifest({ effectKeys: ['onSowExtraField'] }), "effect hook 'onSowExtraField'"],
    [manifest({ effectKeys: ['onBuy'], effectMetadata: { handHooks: ['onBuy'] } }), "hand hook 'onBuy'"],
    [listener({ actions: ['forest'] }), "listener action 'forest'"],
    [listener({ phases: ['during'] }), "listener phase 'during'"],
    [listener({ scope: 'everyone' }), "listener scope 'everyone'"],
  ])('rejects a declaration outside the contract', (raw, detail) => {
    expect(() => normalizeCustomManifest(raw, CARD_ID)).toThrow(`${detail} is not in the Workshop Capability Contract`)
  })

  it('keeps the declared effect metadata and listener data fields', () => {
    const metadata = {
      beforeEndGameScope: 'allPlayers', beforeEndGameMandatory: false, preHarvestGoodsWanted: ['grain'],
      preHarvestGoodsWantedBeforeReap: ['vegetable'], maySkipHarvestFieldPhase: true, extraTurnBeforeWorkers: true,
    }
    const data = { zones: ['hand', 'played'], mandatory: true, preScoring: true, replacesTurn: false, blockedAnytimeInteractionKinds: ['animal-reorg'] }
    const normalized = normalizeCustomManifest({
      effectKeys: [], effectMetadata: metadata, listeners: [{ registrationId: `${CARD_ID}:listener:0`, phases: ['anytime'], ...data }],
    }, CARD_ID)

    expect(normalized.effectMetadata).toEqual(metadata)
    expect(normalized.listeners[0]).toMatchObject(data)
    // A listener that declares none of them carries none.
    expect(Object.keys(normalizeCustomManifest(listener({ phases: ['after'] }), CARD_ID).listeners[0]!).sort())
      .toEqual(['actions', 'cardIds', 'phases', 'registrationId', 'scope'])
  })

  it.each([
    [manifest({ effectMetadata: { beforeEndGameScope: 'everyone' } }), "effect beforeEndGameScope must be 'owner' or 'allPlayers'"],
    // The engine reads these by truthiness, so the string would switch the behavior on.
    [manifest({ effectMetadata: { beforeEndGameMandatory: 'false' } }), 'effect beforeEndGameMandatory must be a boolean'],
    [manifest({ effectMetadata: { maySkipHarvestFieldPhase: 1 } }), 'effect maySkipHarvestFieldPhase must be a boolean'],
    [manifest({ effectMetadata: { extraTurnBeforeWorkers: 'yes' } }), 'effect extraTurnBeforeWorkers must be a boolean'],
    [manifest({ effectMetadata: { preHarvestGoodsWanted: 'grain' } }), 'effect preHarvestGoodsWanted must be an array of resource names'],
    [manifest({ effectMetadata: { preHarvestGoodsWantedBeforeReap: [1] } }), 'effect preHarvestGoodsWantedBeforeReap must be an array of resource names'],
    [listener({ zones: ['discard'] }), "listener zones must be an array of 'played' or 'hand'"],
    [listener({ mandatory: 'false' }), 'listener mandatory must be a boolean'],
    [listener({ preScoring: 1 }), 'listener preScoring must be a boolean'],
    [listener({ replacesTurn: 'true' }), 'listener replacesTurn must be a boolean'],
    [listener({ blockedAnytimeInteractionKinds: 'choice' }), 'listener blockedAnytimeInteractionKinds must be an array of interaction kinds'],
  ])('rejects a declaration of the wrong type', (raw, message) => {
    expect(() => normalizeCustomManifest(raw, CARD_ID)).toThrow(message)
  })

  it('registers only the well-typed declarations of an already saved manifest', () => {
    expect(registeredEffectMetadata({
      effectHooks: [], listeners: [],
      effectMetadata: { handHooks: ['onRoundStart', 'onBuy'], beforeEndGameMandatory: 'false', extraTurnBeforeWorkers: true } as never,
    })).toEqual({ handHooks: ['onRoundStart'], extraTurnBeforeWorkers: true })
    expect(registeredListenerData({ registrationId: 'x', mandatory: 'false', preScoring: true, allowAnytimeReentry: true } as never))
      .toEqual({ preScoring: true })
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
    expect(() => assertCustomEffectResult(hook, { type: 'leaf', actionId: 'place-farmer' }, CARD_ID))
      .toThrow(`${hook}: actionId 'place-farmer' is not in the Workshop Capability Contract`)
    expect(() => assertCustomEffectResult(hook, { type: 'leaf', actionId: 'gain', sourceCard: 'A001_Other' }, CARD_ID))
      .toThrow(`${hook}: sourceCard must be this card's id`)
  })

  it('classifies every contract hook as a flow hook or a typed query hook', () => {
    expect(cardEffectHooks.filter(hook => !isFlowResultHook(hook) && !QUERY_HOOK_RESULT_KINDS[hook])).toEqual([])
  })

  it('accepts a query hook result of the documented top-level type, or none', () => {
    expect(() => assertCustomEffectResult('computeBonusScore', 3, CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult('onBeforePlayerTurn', { skipTurn: true }, CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult('onComputeAnimalZones', [{ type: 'card' }], CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult('computeHarvestBreedOrderPriority', null, CARD_ID)).not.toThrow()
    expect(() => assertCustomEffectResult('getRuleContributions', undefined, CARD_ID)).not.toThrow()
  })

  it.each([
    ['computeBonusScore', { score: 2, label: 'bonus' }, 'a finite number'],
    ['computeExtraRoomCapacity', '1', 'a finite number'],
    ['computeSharedPostScore', {}, 'an array'],
    ['computeCostedBonus', { levels: [] }, 'an array'],
    ['computeLockedFarmTiles', 'none', 'an array'],
    ['getRuleContributions', [], 'an object'],
    ['onBeforePlayerTurn', true, 'an object'],
    ['computeResourceCommitments', { grain: 1 }, 'an array'],
    ['countExtraTurns', '2', 'a finite number'],
    // Read by truthiness: the string would require the reorganization.
    ['enforceReorganizeOnLastHarvest', 'false', 'a boolean'],
    ['computeBreedThreshold', true, 'a finite number'],
    ['computeBreedableAnimalCount', [2], 'a finite number'],
    ['computeAnimalScoreAdjustment', { score: 1 }, 'a finite number'],
    ['onComputeSharedAnimalZones', { id: 'zone' }, 'an array'],
  ])('rejects a %s result of the wrong top-level type', (hook, result, expected) => {
    expect(() => assertCustomEffectResult(hook, result, CARD_ID)).toThrow(`${hook}: must return ${expected}`)
  })
})

describe('extraHookArguments', () => {
  const args = ['state', 'player', 'third', 'fourth', 'fifth', 'sixth']

  it('passes the fourth and fifth arguments only to the hooks that document them', () => {
    expect(extraHookArguments('computeBreedThreshold', args)).toEqual(['fourth'])
    expect(extraHookArguments('computeBreedableAnimalCount', args)).toEqual(['fourth', 'fifth'])
    expect(extraHookArguments('computeAnimalScoreAdjustment', args)).toEqual(['fourth'])
    expect(extraHookArguments('onComputeSharedAnimalZones', args)).toEqual(['fourth'])
    // The other hooks keep their documented three: resolveChoice has no ctx, getInvalidAnimals no state.
    expect(extraHookArguments('resolveChoice', args)).toEqual([])
    expect(extraHookArguments('getInvalidAnimals', args)).toEqual([])
    expect(extraHookArguments('onBuy', args)).toEqual([])
  })
})
