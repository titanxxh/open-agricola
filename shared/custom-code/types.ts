import type { ActionHookPhase, ActionHookResult } from '../actions/hooks'
import type { ActionFlow, GameState, PlayerState } from '../contract/types'
import type { CardListenerContext, CardListenerScope } from '../cards/card-listeners'
import type {
  CardEffectField,
  HandCardEffectHook,
  PaymentInfo,
} from '../cards/card-effects'
import type { SandboxEffectMetadata, SandboxListenerData } from './sandbox-declarations'

export type CustomCodeEffectMetadata = SandboxEffectMetadata & {
  handHooks?: HandCardEffectHook[]
}

export type CustomCodeListenerManifest = SandboxListenerData & {
  registrationId: string
  cardIds?: string[]
  actions?: string[]
  phases?: ActionHookPhase[]
  scope?: CardListenerScope
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
  state: GameState
  player: PlayerState
  paymentInfo?: PaymentInfo
  /** The fourth and later positional arguments, for the hooks that document them. */
  extraArgs?: unknown[]
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
  result: ActionFlow | null
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
