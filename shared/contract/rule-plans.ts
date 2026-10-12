import type { RuleActivatedOperation } from './rule-activated-operations'
import type { RuleFixedOperation } from './rule-fixed-operations'
import type { PromptKey } from './prompt-keys'
import type { FlowCardEffectHook } from './card-effect-hooks'
import type { FutureMeepleResourceMap, Resource, RuleAmount, RuleCondition } from './types'

/** Executable purchase rules, indexed by original payment path, not actual discounted payment. */
export type PurchaseOutcomeRule =
  | { kind: 'gain'; resources: Partial<Resource> }
  | { kind: 'future-prefix'; offset: number; count: number; resources: FutureMeepleResourceMap }

export type { RuleAmount, RuleCondition } from './types'
export type RuleActionId = 'occupation' | 'family-growth' | 'plow' | 'sow' | 'fence' | 'stables' | 'construct' | 'renovate-house' | 'improvement' | 'bake-bread' | 'breed' | 'gain' | 'pay' | 'bonus-vp'
export type RuleJson = null | boolean | number | string | readonly RuleJson[] | { readonly [key: string]: RuleJson }
export type RuleOperation = RuleFixedOperation | RuleActivatedOperation
export type RuleBody =
  | { kind: 'operation'; operation: RuleOperation }
  | { kind: 'action'; actionId: RuleActionId; params?: Readonly<Record<string, RuleJson>>; policy?: { trueAction?: false; exactCost?: Partial<Resource>; fencePolicy?: { costPolicy: { fence: Partial<Resource> } } } }
  | { kind: 'gain'; resources: Readonly<Partial<Record<keyof Resource, RuleAmount>>> }
  | { kind: 'seq' | 'xor' | 'or' | 'parallel'; children: readonly RuleBody[] }
  | { kind: 'optional'; body: RuleBody; promptKey?: PromptKey }
  | { kind: 'condition'; condition: RuleCondition; body: RuleBody }

export const timedRuleEventPhases = ['afterReceive', 'afterCollect', 'contributeExtraTurn', 'onBeforePlayerTurn'] as const
export type TimedRuleEventPhase = typeof timedRuleEventPhases[number]
export type TimedRulePhase = Exclude<FlowCardEffectHook, 'onBuy'> | TimedRuleEventPhase

export type TimedRule = {
  /** Continue only this activated obligation when its source leaves the played zone. */
  retainAfterCardLeaves?: true
  key: string
  at: (
    | { kind: 'rounds'; rounds: readonly number[] }
    | { kind: 'card-round'; fact: string }
    | { kind: 'round-window'; fact: string }
    | { kind: 'supply-worker-round'; fact: string }
    | { kind: 'flag'; fact: string; clock: 'current-round' | 'next-harvest' }
    | { kind: 'card-flag'; clock: 'current-round' | 'current-turn' }
    | { kind: 'card-list-nonempty'; fact: string }
    | { kind: 'card-positive'; fact: string; roundFact?: string; clock: 'current-round' | 'current-turn' }
    | { kind: 'future-source' }
    | { kind: 'worker-on-space'; spaceId: string }
    | { kind: 'next-stored-payout'; rounds: readonly number[]; resources: readonly (keyof Resource)[] }
  ) & { phase: TimedRulePhase; episodeFact?: string }
  consume?: { clearFlag?: string; clearCardFlag?: true; recordTurnFact?: string }
  body: RuleBody
}
