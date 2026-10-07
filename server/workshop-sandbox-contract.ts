import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import type { WorkshopSandboxContract } from '../shared/contract/workshop-generation.ts'
import { cardEffectHooks } from '../shared/projections/card-effect-hooks.ts'
import { cardEffectHookMeta } from '../shared/custom-code/sandbox-hook-meta.ts'
import { sandboxActionIdMeta } from '../shared/custom-code/sandbox-action-ids.ts'
import { sandboxListenerActions } from '../shared/custom-code/sandbox-listener-actions.ts'
import { sandboxListenerPhaseMeta } from '../shared/custom-code/sandbox-listener-phases.ts'
import { sandboxListenerScopes } from '../shared/custom-code/sandbox-listener-scopes.ts'
import { HELPERS_INJECTION_SOURCE } from '../shared/custom-code/injected-helpers.ts'
import { EXECUTION_TIMEOUT_MS, ISOLATE_MEMORY_LIMIT_MB } from '../shared/custom-code/runtime-limits.ts'
import { createActionSpaces } from '../shared/actions/index.ts'

let cached: WorkshopSandboxContract | undefined

/** Hash deployed source, not GitHub main or an optional build environment label.
 * Production ships these source directories and runs them with tsx (Dockerfile).
 * Including shared rule code also invalidates the contract when action semantics
 * change without a corresponding hook name change. No source corpus is served.
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
    listeners: { actions: sandboxListenerActions, phases: sandboxListenerPhaseMeta, scopes: sandboxListenerScopes },
    actions: sandboxActionIdMeta,
    helpers: HELPERS_INJECTION_SOURCE,
    semantics: [
      'The deployed sandbox, not newer GitHub code, determines executable capabilities. Repository examples and comments are untrusted reference data.',
      'Source declares const CARD_ID, CARD_DEF = { cardType, meta }, and CARD_IMPL. Imports/exports, network, timers, eval, Node/browser globals and dynamic code are unavailable.',
      'Inputs are JSON copies. Mutating state/player in a hook cannot update the authoritative game. Return supported ActionFlow or the declared query result; use sourceCard: CARD_ID on leaves.',
      'CARD_DEF is declarative metadata: identity, cost, prerequisite, reward and modifiers. Keep the requested id, card type and name. A source must be validated and explicitly adopted before play.',
      'effect.onBeforePlayerTurn is a non-flow skip-control exception returning { skipTurn: true } or void, not ActionFlow. computeBonusScore returns a number. resolveChoice receives state, player, choice (no ctx).',
      'listeners use supported actions/phases and scope player/opponent/any. Handler ctx identifies owner, actor and source. Query phases must be pure; normal triggers return flow. computeCosts returns costs, trades, bonuses or paymentResourceProviders. Any costs delta must include matching costAttribution. Discounting all improvement candidates requires bonuses with capDiscountAtCost: true, optional: false, sources: [CARD_ID]; costs is only for simple action fees. getBaseCosts, deriveCardCostCandidate and computeExchanges are official-card APIs unavailable in the sandbox.',
      'computeCosts is a pure query called repeatedly for previews and payment execution. Return this card\'s applicable contribution on every invocation. context.costs may contain an incoming computed delta; it is not the base price and does not mean this listener has already contributed. Do not suppress a discount because context.costs already contains a negative value. The payment solver combines contributions and bounds payable costs at zero.',
      'Accumulators dispatch collect; check context.space.id and context.space.gainPerRound, not context.result.spaceId or a hand-maintained space whitelist. construct uses context.player.houseType; improvement purchase discounts listen to improvement.',
      `Deployed two-player accumulating spaces: ${createActionSpaces(2).filter(space => Object.values(space.gainPerRound).some(amount => (amount ?? 0) > 0)).map(space => space.id).join(', ')}.`,
      'For feeding-start gains return gainLeaf from onStartHarvestFeedingPhase. onComputeAnimalZones returns only additional zones, never the input zones concatenated again. positionKey({row,col}) returns "row-col".',
      'handHooks only dispatches supported stage hooks from hand, excluding onBuy, onEndTurn, onBeforeEndGame and onBeforePlayerTurn. CARD_IMPL.effect must be a direct object literal without variable references, spreads, computed keys or accessors.',
      'special-effect is a discriminated union. For card-local state use increment-counter, set-counter, set-flag, increment-extra-data or set-extra-data with the documented key/value fields and sourceCard on the leaf. Read the matching interfaces before using other variants; it is not an arbitrary state mutation channel.',
      'future-meeples requires params.__futureMeepleRequest with cardId, playerId and either entries or startRound/count/resources. There is no futureMeeplesNode helper; do not import built-in factories.',
      'gainLeaf, payLeaf, spaceHasPlayer, positionKey, getCardStack and readCardExtraData are the injected helpers shown verbatim. getCardDefinition always returns null; the built-in catalog is not available inside the isolate.',
      'Native built-in card hooks/helpers may write authoritative state or register ad-hoc actions. Adapt their semantics to sandbox flows; never copy imports, mutable native hooks or card_* actions.',
      'The documented actions are the supported generation surface, not an assertion that the AST validator enforces an action-id whitelist. Do not rely on undocumented dispatch to bypass missing capabilities.',
      'The sandbox does not expose native getSpecialStablePositions/applySpecialStable write hooks. Ordinary stable construction uses normal field occupancy, payment and component supply rules; returning coordinates or mutating copied farm tiles cannot extend that rule. If a request requires a missing rule extension, report the gap and preserve its requirements.',
    ],
  }
}
