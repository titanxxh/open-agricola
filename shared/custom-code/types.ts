import type { ActionHookPhase, ActionHookResult } from '../actions/hooks'
import type { ActionFlow, GameState, PlayerState } from '../game/types'
import type { CardListenerContext, CardListenerScope } from '../cards/card-listeners'
import type { CardEffectHook, PaymentInfo } from '../cards/card-effects'

export type CustomCodeListenerManifest = {
  registrationId: string
  cardIds?: string[]
  actions?: string[]
  phases?: ActionHookPhase[]
  order?: number
  scope?: CardListenerScope
}

export type CustomCodeManifest = {
  effectHooks: CardEffectHook[]
  listeners: CustomCodeListenerManifest[]
}

export type CustomCodeEffectInvocation = {
  compiledCode: string
  cardId: string
  hook: CardEffectHook
  state: GameState
  player: PlayerState
  paymentInfo?: PaymentInfo
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
