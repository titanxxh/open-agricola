import { moorSpecialActionCardDefinitions } from '../../moor/special-action-cards'
import { describe, expect, it } from 'vitest'
import { cardEffectHooks } from '../../cards/card-effects'
import { assertSandboxListenerManifest } from '../sandbox-listener-phases'
import {
  assertCustomEffectResult, extraHookArguments, isFlowResultHook, normalizeCustomManifest, QUERY_HOOK_RESULT_KINDS,
  registeredEffectMetadata, registeredListenerData, type RawCustomManifest,
} from '../contract-admission'

const CARD_ID = 'CUSTOM_Admission'
const manifest = (overrides: Partial<RawCustomManifest>): RawCustomManifest => ({ effectKeys: [], listeners: [], ...overrides })
const listener = (fields: Partial<RawCustomManifest['listeners'][number]>) =>
  manifest({ listeners: [{ registrationId: `${CARD_ID}:listener:0`, actions: ['collect'], phases: ['after'], ...fields }] })

describe('normalizeCustomManifest', () => {
  it.each([
    {}, { actions: [], phases: ['after'] }, { actions: ['collect'], phases: [] },
    { actions: ['collect'], phases: ['anytime'] }, { actions: ['place-farmer'], phases: ['immediatelyAfter'] },
    { actions: ['collect'], phases: ['after'], events: ['farm.sown'] },
  ])('rejects implicit or incompatible listener filters %j', filters => {
    expect(() => normalizeCustomManifest(manifest({ listeners: [{ registrationId: 'invalid', ...filters }] }), CARD_ID)).toThrow()
  })
  it.each(['moor-action', ...new Set(moorSpecialActionCardDefinitions.flatMap(card => card.actions))])('rejects native-only Moor target %s in raw and saved manifests', action => {
    expect(() => normalizeCustomManifest(listener({ actions: ['collect', action] }), CARD_ID)).toThrow(/listener|Listener/)
    const saved = JSON.parse(JSON.stringify({ effectHooks: [], listeners: [{ registrationId: 'saved', actions: [action], phases: ['after'] }] }))
    expect(() => assertSandboxListenerManifest(CARD_ID, saved)).toThrow(/listener|Listener/)
  })

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

  it('binds a listener to its own card and preserves explicit query identities', () => {
    const [bound] = normalizeCustomManifest(listener({}), CARD_ID).listeners
    expect(bound!.cardIds).toEqual([CARD_ID])
    expect(bound!.phases).toEqual(['after'])
    expect(bound!.actions).toEqual(['collect'])
    expect(normalizeCustomManifest(listener({ actions: ['anytime'], phases: ['anytime'] }), CARD_ID).listeners[0]!.actions)
      .toEqual(['anytime'])
    expect(normalizeCustomManifest(listener({ actions: ['compute-exchanges'], phases: ['computeExchanges'] }), CARD_ID).listeners[0]!.actions)
      .toEqual(['compute-exchanges'])
  })

  it.each([
    [manifest({ effectKeys: ['onSowExtraField'] }), "effect hook 'onSowExtraField'"],
    [manifest({ effectKeys: ['onBuy'], effectMetadata: { handHooks: ['onBuy'] } }), "hand hook 'onBuy'"],
    [listener({ actions: ['forest'] }), "listener action 'forest'"],
    [listener({ actions: ['wish-children'] }), "listener action 'wish-children'"],
    [listener({ actionSpaces: ['fishing'] }), 'listener action-space selector'],
    [listener({ phases: ['during'] }), "listener phase 'during'"],
    [listener({ scope: 'everyone' }), "listener scope 'everyone'"],
  ])('rejects a declaration outside the contract', (raw, detail) => {
    expect(() => normalizeCustomManifest(raw, CARD_ID)).toThrow(`${detail} is not in the Workshop Capability Contract`)
  })

  it.each([['fishing'], undefined, () => ['fishing']])('rejects an unopened native selector in fresh and saved manifests', actionSpaces => {
    expect(() => normalizeCustomManifest(listener({ actionSpaces }), CARD_ID)).toThrow('listener action-space selector')
    const saved = { effectHooks: [], listeners: [{ registrationId: 'saved', actions: ['collect'], phases: ['after'], actionSpaces }] }
    expect(() => Reflect.apply(assertSandboxListenerManifest, undefined, [CARD_ID, saved])).toThrow('unsupported selector')
    expect(normalizeCustomManifest(listener({}), CARD_ID).listeners[0]).toMatchObject({ actions: ['collect'], phases: ['after'] })
  })

  it('keeps the declared effect metadata and listener data fields', () => {
    const metadata = {
      beforeEndGameScope: 'allPlayers', beforeEndGameMandatory: false, preHarvestGoodsWanted: ['grain'],
      preHarvestGoodsWantedBeforeReap: ['vegetable'], maySkipHarvestFieldPhase: true, extraTurnBeforeWorkers: true,
    }
    const data = { zones: ['hand', 'played'], mandatory: true, preScoring: true, replacesTurn: false, blockedAnytimeInteractionKinds: ['animal-reorg'] }
    const normalized = normalizeCustomManifest({
      effectKeys: [], effectMetadata: metadata, listeners: [{ registrationId: `${CARD_ID}:listener:0`, actions: ['anytime'], phases: ['anytime'], ...data }],
    }, CARD_ID)

    expect(normalized.effectMetadata).toEqual(metadata)
    expect(normalized.listeners[0]).toMatchObject(data)
    // A listener that declares none of them carries none.
    expect(Object.keys(normalizeCustomManifest(listener({ phases: ['after'] }), CARD_ID).listeners[0]!).sort())
      .toEqual(['actions', 'cardIds', 'phases', 'registrationId', 'scope'])
  })

  it('admits an exclusively pre-scoring anytime listener declaration', () => {
    const normalized = normalizeCustomManifest(listener({
      actions: ['anytime'], phases: ['anytime'], preScoring: 'only',
    }), CARD_ID)
    expect(normalized.listeners[0]?.preScoring).toBe('only')
    expect(registeredListenerData(normalized.listeners[0]!)).toEqual({ preScoring: 'only' })
  })

  it.each([
    [manifest({ effectMetadata: { beforeEndGameScope: 'everyone' } }), "effect beforeEndGameScope must be 'owner' or 'allPlayers'"],
    // The engine reads these by truthiness, so the string would switch the behavior on.
    [manifest({ effectMetadata: { beforeEndGameMandatory: 'false' } }), 'effect beforeEndGameMandatory must be a boolean'],
    [manifest({ effectMetadata: { maySkipHarvestFieldPhase: 1 } }), 'effect maySkipHarvestFieldPhase must be a boolean'],
    [manifest({ effectMetadata: { extraTurnBeforeWorkers: 'yes' } }), 'effect extraTurnBeforeWorkers must be a boolean'],
    [manifest({ effectMetadata: { preHarvestGoodsWanted: 'grain' } }), 'effect preHarvestGoodsWanted must be an array of resource names'],
    [manifest({ effectMetadata: { preHarvestGoodsWantedBeforeReap: [1] } }), 'effect preHarvestGoodsWantedBeforeReap must be an array of resource names'],
    // A misspelled resource would match no exchange and silently switch the declaration off.
    [manifest({ effectMetadata: { preHarvestGoodsWanted: ['grane'] } }), 'effect preHarvestGoodsWanted must be an array of resource names'],
    [manifest({ effectMetadata: { preHarvestGoodsWantedBeforeReap: ['grain', 'fence'] } }), 'effect preHarvestGoodsWantedBeforeReap must be an array of resource names'],
    [listener({ zones: ['discard'] }), "listener zones must be an array of 'played' or 'hand'"],
    [listener({ mandatory: 'false' }), 'listener mandatory must be a boolean'],
    [listener({ preScoring: 1 }), "listener preScoring must be a boolean or 'only'"],
    [listener({ preScoring: 'true' }), "listener preScoring must be a boolean or 'only'"],
    [listener({ replacesTurn: 'true' }), 'listener replacesTurn must be a boolean'],
    [listener({ blockedAnytimeInteractionKinds: 'choice' }), 'listener blockedAnytimeInteractionKinds must be an array of interaction kinds'],
    // A misspelled kind would never match, leaving the entry offered during that interaction.
    [listener({ blockedAnytimeInteractionKinds: ['farm-selct'] }), 'listener blockedAnytimeInteractionKinds must be an array of interaction kinds'],
    // null is a declared value, not an omitted key: it must not fall back to the engine default.
    [listener({ mandatory: null }), 'listener mandatory must be a boolean'],
    [manifest({ effectMetadata: { beforeEndGameMandatory: null } }), 'effect beforeEndGameMandatory must be a boolean'],
  ])('rejects a declaration of the wrong type', (raw, message) => {
    expect(() => normalizeCustomManifest(raw, CARD_ID)).toThrow(message)
  })

  it('registers only the well-typed declarations of an already saved manifest', () => {
    expect(registeredEffectMetadata({
      effectHooks: [], listeners: [],
      effectMetadata: { handHooks: ['onRoundStart', 'onBuy'], beforeEndGameMandatory: 'false', extraTurnBeforeWorkers: true } as never,
    })).toEqual({ handHooks: ['onRoundStart'], extraTurnBeforeWorkers: true })
    expect(registeredListenerData({ registrationId: 'x', mandatory: 'false', preScoring: true, replacesTurn: null, allowAnytimeReentry: true } as never))
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

describe('animal zone ownership', () => {
  const owner = { id: 'p1' }
  const other = { id: 'p2' }
  const zone = (fields: Record<string, unknown>) => [{ id: 'zone', zoneType: 'card', capacity: 2, ...fields }]

  it('accepts zones that name nothing, or their own card and the players the hook was called for', () => {
    expect(() => assertCustomEffectResult('onComputeAnimalZones', zone({}), CARD_ID, [owner, []])).not.toThrow()
    expect(() => assertCustomEffectResult('onComputeAnimalZones',
      zone({ cardId: CARD_ID, ownerPlayerId: 'p1', animalOwnerPlayerId: 'p1' }), CARD_ID, [owner, []])).not.toThrow()
    expect(() => assertCustomEffectResult('onComputeSharedAnimalZones',
      zone({ cardId: CARD_ID, ownerPlayerId: 'p1', animalOwnerPlayerId: 'p2' }), CARD_ID, [owner, other])).not.toThrow()
  })

  it.each([
    ['onComputeAnimalZones', { cardId: 'A012_DrinkingTrough' }, "zone cardId must be this card's id"],
    ['onComputeAnimalZones', { ownerPlayerId: 'p2' }, "zone ownerPlayerId must be the card owner's id"],
    ['onComputeSharedAnimalZones', { cardId: 'A012_DrinkingTrough' }, "zone cardId must be this card's id"],
    // Reorganization would store the animals in the other player's card state.
    ['onComputeSharedAnimalZones', { ownerPlayerId: 'p2' }, "zone ownerPlayerId must be the card owner's id"],
    ['onComputeSharedAnimalZones', { animalOwnerPlayerId: 'p1' }, 'zone animalOwnerPlayerId must be the id of the player the zones are computed for'],
  ])('rejects a %s zone attributed elsewhere', (hook, fields, message) => {
    expect(() => assertCustomEffectResult(hook, zone(fields), CARD_ID, [owner, other])).toThrow(`${hook}: ${message}`)
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
