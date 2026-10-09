import type { ActionHookPhase, ActionHookResult } from '../actions/hooks'
import type { InteractionRequest, ResourceKey } from '../contract/types'
import type { CardListenerContext, CardListenerScope } from '../cards/card-listeners'
import type {
  BeforeEndGameScope,
  CardEffectField,
  HandCardEffectHook,
} from '../cards/card-effects'

export type CustomCodeEffectMetadata = {
  handHooks?: HandCardEffectHook[]
  beforeEndGameScope?: BeforeEndGameScope
  beforeEndGameMandatory?: boolean
  preHarvestGoodsWanted?: ResourceKey[]
  preHarvestGoodsWantedBeforeReap?: ResourceKey[]
  maySkipHarvestFieldPhase?: boolean
  extraTurnBeforeWorkers?: boolean
}

export type CustomCodeListenerManifest = {
  registrationId: string
  cardIds?: string[]
  actions?: string[]
  phases?: ActionHookPhase[]
  scope?: CardListenerScope
  zones?: ('played' | 'hand')[]
  mandatory?: boolean
  preScoring?: boolean
  replacesTurn?: boolean
  blockedAnytimeInteractionKinds?: InteractionRequest['kind'][]
}

export type CustomCodeManifest = {
  effectHooks: CardEffectField[]
  effectMetadata?: CustomCodeEffectMetadata
  listeners: CustomCodeListenerManifest[]
}

export type CustomCodeEffectInvocation = {
  compiledCode: string
  cardId: string
  hook: CardEffectField
  /** Complete positional arguments, JSON copied before invocation. */
  args: unknown[]
}

export type CustomCodeListenerInvocation = {
  compiledCode: string
  cardId: string
  registrationId: string
  context: CardListenerContext
}

export type CustomCodeValidateResult =
  | {
    valid: true
    compiledCode: string
    manifest: CustomCodeManifest
    cardDefinition: Record<string, unknown> | null
  }
  | {
    valid: false
    errors: string[]
  }

export type CustomCodeEffectResult = {
  ok: true
  result: unknown
} | {
  ok: false
  error: string
}

export type CustomCodeListenerResult = {
  ok: true
  result: ActionHookResult | null
} | {
  ok: false
  error: string
}
