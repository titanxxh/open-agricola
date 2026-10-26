# 24. Choice previews use shared rule plans and authoritative spatial targets

- Status: Accepted
- Date: 2026-10-09

## Context

Choice previews, action descriptions and future-board markers were produced by card-specific presentation code, text heuristics or opaque choice values. They drifted from what execution actually did, hid nested effects and payments, collapsed different timed effects together, and let the client guess farm targets. A source audit (48 native anytime entries, 205 option annotations, 85 schedule-primitive sources, 219 phase-hook candidates) showed how widespread the opaque consequences were.

## Decision

- **Shared rule plans.** Choice Preview and every executable action or option description derive from the executable semantics of shared rule primitives. Cards migrate opaque purchase-path, scheduled-offer and timed callbacks into those primitives; they never keep a separate presentation implementation, and a presentation-only callback that recreates a reward is not an acceptable bridge. Execution and description consume the same plan, preserving order, timing, actor, optionality and conditions.
- **Semantic identity.** Full descriptions keep the option's semantic identity: a purchase payment tree does not replace the selected card's name, and a fixed placement supplies its actual destination and nested description. Original Payment Path identity binds a purchase outcome even when discounts change the resources paid. Static names and semantic branch labels stay presentation metadata; costs, quantities, timing and conditions come from the rule plan; printed rules remain authored text.
- **Full recursion.** Descriptions keep the complete declared flow (sequence, exclusive and inclusive choices, parallel effects, optional steps), describe unresolved quantities or targets as choices, and omit internal bookkeeping. An improvement or occupation action with more than two final candidate-card options uses a card-selection summary in its preview instead of recursively listing every card and payment. The summary retains type and card restrictions; the actual card and payment requests retain all options. Payment alternatives do not count toward this limit. Occupation previews with at most two candidates still merge identical payment previews.
- **Detached projection.** The preview layer may project declared deterministic storage operations onto a detached copy and read existing source-card scoring queries; it reports the source card's contribution change, not a whole-branch score. It never runs arbitrary callbacks, advances a cloned Engine or changes admission.
- **Future effects.** Schedules use execution's target filtering and distinguish received resources, optional actions, conditional rewards and purchase offers. The board shows already scheduled or activated timed effects, separated by receiving player (in that player's color) and by source and complete content; timing is part of identity. Only effects with the same source, target, reward, costs and conditions share a group, which keeps multiplicity and never deduplicates execution. Standing abilities stay on their cards. Public projection contains only explicit player-facing facts, never raw card state, callbacks or contexts, and keeps hidden hands and unrevealed action identity protected.
- **Actors.** Action-space descriptions show base rules; executable options show the current Interaction Player's actual costs and effects. Changing the Farm View Player does not change the rule actor. Baking recipes come from the authoritative trade rules.
- **Spatial targets.** Farm target choices carry backend-declared legal targets and opaque bindings. Players click ordinary targets on the farm and Card Field targets on their crop slots; slots of one Logical Field share one identity. A target with several legal alternatives requires an explicit choice; the client never picks the first binding or derives legality from card strings.
- **Audience.** Pure plan factories receive no event or Protected Observation emitters. Private target previews follow the interaction audience in both idle and waiting states.
- Related: current-step admission (ADR 0015), Future Schedule targets (ADR 0018), hidden round information (ADR 0020), state visibility (ADR 0023).

## Consequences

- Previews and descriptions cannot drift from execution, and card authors write no presentation code for effects.
- Repeated preview reads must never spend resources, queue offers, change state, advance RNG or history, emit logs or progress the interaction; Session and browser tests cover this with real responses in both locales.

## Alternatives considered

- Card-owned preview callbacks or a card-specific presentation registry: duplicate rule knowledge.
- General speculative execution of existing callbacks: adds isolation, hidden-information and budget concerns without an inspectable shared contract.
