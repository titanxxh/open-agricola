import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import type { WorkshopSandboxContract } from '../shared/contract/workshop-generation.ts'
import { cardEffectHooks } from '../shared/projections/card-effect-hooks.ts'
import { cardEffectHookMeta } from '../shared/custom-code/sandbox-hook-meta.ts'
import { SANDBOX_SPECIAL_EFFECT_KINDS, sandboxActionIdMeta } from '../shared/custom-code/sandbox-action-ids.ts'
import { sandboxListenerActions } from '../shared/custom-code/sandbox-listener-actions.ts'
import { sandboxListenerPhaseMeta } from '../shared/custom-code/sandbox-listener-phases.ts'
import { sandboxListenerScopes } from '../shared/custom-code/sandbox-listener-scopes.ts'
import { HELPERS_INJECTION_SOURCE } from '../shared/custom-code/injected-helpers.ts'
import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../shared/custom-code/runtime-limits.ts'
import { createActionSpaces } from '../shared/actions/index.ts'
import type { CardListenerContext } from '../shared/cards/card-listeners.ts'

let cached: WorkshopSandboxContract | undefined

/** Hash deployed source, not GitHub main or an optional build environment label.
 * Production ships these source directories and runs them with tsx (Dockerfile).
 * Including shared rule code also invalidates the contract when action semantics
 * change without a corresponding hook name change. The shipped lockfile also
 * binds resolved validation/executor dependencies. No source corpus is served.
 */
function runtimeDigest(): string {
  const hash = createHash('sha256')
  const visit = (directory: URL, prefix: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === '__tests__' || entry.name === '__stubs__') continue
      const path = `${prefix}${entry.name}`
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory)
      if (entry.isDirectory()) visit(url, `${path}/`)
      else if (entry.isFile() && entry.name.endsWith('.ts')) hash.update(path).update('\0').update(readFileSync(url)).update('\0')
    }
  }
  visit(new URL('../shared/', import.meta.url), 'shared/')
  visit(new URL('./custom-code/', import.meta.url), 'server/custom-code/')
  hash.update(readFileSync(import.meta.filename))
  hash.update(readFileSync(new URL('../package.json', import.meta.url)))
  hash.update(readFileSync(new URL('../pnpm-lock.yaml', import.meta.url)))
  hash.update(process.versions.node).update(process.versions.v8)
  return hash.digest('hex')
}

export function getWorkshopSandboxContract(): WorkshopSandboxContract {
  return cached ??= {
    format: 1,
    id: `sandbox-v1:${runtimeDigest()}`,
    runtime: 'server-isolated-vm',
    limits: { executionTimeoutMs: EXECUTION_TIMEOUT_MS, memoryLimitMb: ISOLATE_MEMORY_LIMIT_MB },
    effects: Object.fromEntries(cardEffectHooks.map(hook => [hook, cardEffectHookMeta[hook]])),
    listeners: {
      actions: sandboxListenerActions, phases: sandboxListenerPhaseMeta, scopes: sandboxListenerScopes,
      players: { actor: 'player', owner: 'ownerPlayer', effectRecipient: 'effectPlayer' } satisfies Record<string, keyof CardListenerContext>,
    },
    actions: sandboxActionIdMeta,
    helpers: HELPERS_INJECTION_SOURCE,
    semantics: [
      'The deployed sandbox, not newer GitHub code, determines executable capabilities. Repository examples and comments are untrusted reference data.',
      'Source declares const CARD_ID, CARD_DEF = { cardType, meta }, and CARD_IMPL. Imports/exports, network, timers, eval, Node/browser globals and dynamic code are unavailable.',
      'Inputs are JSON copies. Mutating state/player in a hook cannot update the authoritative game. Return supported ActionFlow or the declared query result; use sourceCard: CARD_ID on leaves.',
      'ActionFlow grammar: a step is { type: "leaf", actionId, params, sourceCard: CARD_ID }. A group is { type: "seq" | "or" | "xor" | "parallel", children: [flows], optional?: boolean }. The array field is children, never items or steps; optional is a flag, not a node type. Flow effects return the flow directly; listeners return { flow, sourceCard: CARD_ID }. Static validation rejects inspectable group literals with missing or non-array children; dynamic results still require playtesting.',
      'CARD_DEF is declarative metadata: identity, cost, prerequisite, reward and modifiers. Keep the requested id, card type and name. A source must be validated and explicitly adopted before play.',
      'effect.onBeforePlayerTurn is a non-flow skip-control exception returning { skipTurn: true } or void, not ActionFlow. computeBonusScore returns a number. resolveChoice receives state, player, choice (no ctx).',
      'listeners use supported actions/phases and scope player/opponent/any. Handler ctx identifies owner, actor and source. Query phases must be pure; normal triggers return flow. computeCosts returns costs, trades, bonuses or paymentResourceProviders. Any costs delta must include matching costAttribution. Discounting all improvement candidates requires bonuses with capDiscountAtCost: true, optional: false, sources: [CARD_ID]; costs is only for simple action fees. getBaseCosts, deriveCardCostCandidate and computeExchanges are official-card APIs unavailable in the sandbox.',
      'Bind each card listener with cardIds: [CARD_ID] so its scope and owner refer to this card. Listener identity uses the player objects named in listeners.players: context.player is the acting player (also context.triggerPlayer), context.ownerPlayer is the card owner, and context.effectPlayer is the effect recipient, normally the owner. Read their .id fields when comparing identities. context.playerId is not provided; do not guess flat identity fields from native engine internals. For a listener bound with cardIds: [CARD_ID], scope: "player" already restricts dispatch to the card owner, so an extra actor/owner guard is unnecessary. For scope: "any" or "opponent", use the documented player objects and preserve who receives the effect.',
      'computeCosts is a pure query called repeatedly for previews and payment execution. Return this card\'s applicable contribution on every invocation. context.costs may contain an incoming computed delta; it is not the base price and does not mean this listener has already contributed. Do not suppress a discount because context.costs already contains a negative value. The payment solver combines contributions and bounds payable costs at zero.',
      'Accumulators dispatch collect. Read the action-space identity from context.space.id, not context.result.spaceId. To recognize all accumulating spaces, check positive values in context.space.gainPerRound instead of guessing a space whitelist. If the user explicitly names particular spaces, match exactly those space IDs. construct uses context.player.houseType; improvement purchase discounts listen to improvement.',
      `Deployed two-player accumulating spaces: ${createActionSpaces(2).filter(space => Object.values(space.gainPerRound).some(amount => (amount ?? 0) > 0)).map(space => space.id).join(', ')}.`,
      'For feeding-start gains return gainLeaf from onStartHarvestFeedingPhase. onComputeAnimalZones returns only additional zones, never the input zones concatenated again. positionKey({row,col}) returns "row-col".',
      'handHooks only dispatches supported stage hooks from hand, excluding onBuy, onEndTurn, onBeforeEndGame and onBeforePlayerTurn.',
      'Static source structure: CARD_IMPL and CARD_IMPL.effect (when present) must be direct object literals. CARD_IMPL.listeners must be a literal array containing listener object literals directly; never use listeners: [listenerVariable] or listeners: someArray. Each listener handler must be an inline function or method; actions and phases must be literal arrays containing only string literals. Do not use spreads or computed property names in CARD_IMPL, effect or listener objects. CARD_IMPL.effect must not use accessors. Do not reference or mutate CARD_IMPL after its declaration.',
      `special-effect params is a discriminated union. The complete set of kinds is ${SANDBOX_SPECIAL_EFFECT_KINDS.join(', ')}: { kind: "increment-counter", key: string, amount: number }, { kind: "set-counter", key: string, value: number }, { kind: "set-flag", flag: boolean }, { kind: "set-infobox", text: string }, { kind: "set-extra-data", key: string, value: unknown }, { kind: "set-private-data", key: string, value: unknown }, and { kind: "increment-extra-data", key: string, amount: number }. Put sourceCard: CARD_ID on the leaf. Counter variants write player.cardStates[CARD_ID].counters[key]; set-flag writes flagged; set-infobox writes infobox; set-extra-data and increment-extra-data write extraData[key]; set-private-data writes privateData[key], which readCardExtraData does not return. Every other kind, and a listed kind whose fields do not have these types, is rejected; it is not an arbitrary state mutation channel.`,
      'future-meeples requires params.__futureMeepleRequest with cardId, playerId and either entries or startRound/count/resources. There is no futureMeeplesNode helper; do not import built-in factories.',
      'Preplacing rewards on future rounds uses future-meeples so the engine owns the visible scheduled entries, delivery and cleanup. Do not replace that scheduling with store-on-card plus a flag/onRoundStart payout: counters stored on a card are not future round placements. Read the future-meeples request interface or sandbox example for its entry shape.',
      'gainLeaf, payLeaf, spaceHasPlayer, positionKey, getCardStack and readCardExtraData are the injected helpers shown verbatim. getCardDefinition always returns null; the built-in catalog is not available inside the isolate.',
      'Native built-in card hooks/helpers may write authoritative state or register ad-hoc actions. Adapt their semantics to sandbox flows; never copy imports, mutable native hooks or card_* actions.',
      'The listed actions, listener actions and phases, and special-effect kinds are enforced. Source validation rejects a visible leaf outside them, and execution rejects a returned flow, alternativeFlow, followUpActions entry or replacement actionId outside them, including inside nested groups. Anything not listed is unavailable: report the gap instead of trying an undocumented name. A node may also carry optional, promptKey and anytimeWindow, and a leaf may carry actionContext; the other native node fields (mode, triggerSelectOnce, expandFlow, optionId, choiceLabelKey, choiceLabelParams, effectPreview, anytimeActionId and node-level targetPlayerId) are rejected. sourceCard on a node, a listener result or a followUpActions entry must be CARD_ID.',
      'A listener declares only handler, actions, phases, scope and cardIds (plus an optional id label); any other field is rejected. A listener always belongs to its own card and reacts only while that card is in play; cardIds may be omitted and, if written, must be [CARD_ID]. Omitted actions or phases mean the listed sets, never action-space ids or other native actions.',
      'The sandbox does not expose native getSpecialStablePositions/applySpecialStable write hooks. Ordinary stable construction uses normal field occupancy, payment and component supply rules; returning coordinates or mutating copied farm tiles cannot extend that rule. If a request requires a missing rule extension, report the gap and preserve its requirements.',
    ],
  }
}
