# 8. Same-timing reactions use parallel trigger selection

- Status: Accepted
- Date: 2026-07-02

## Context

In the reference implementation, `PlayerCards::getReaction($event)` collects the cards that can react to an event and offers them as card activations under `NODE_PARALLEL`; card methods run only when an activation leaf executes, previews its doability or rebuilds its description. Compute hooks only aggregate deterministically.

OA required a per-card opt-in for trigger selection, split Harvest field stage hooks into hand-written automatic and interactive flows, and took only the first extra-turn provider, so with M057 Taps and A092 Adoptive Parents together one provider hid the other. Reaction order was decided by implementation details rather than by the player.

## Decision

- **Default trigger selection**: `before` / `immediatelyAfter` / `after` action reaction listeners for one trigger player and phase enter `ParallelNode(mode='trigger-select')` by default. A single child expands directly. Compute and query hooks stay deterministic aggregation and never enter trigger-select.
- **Activation children**: trigger-select previews `activate-card` (listeners), `activate-card-effect` (stage card effects) and `activate-extra-turn` (extra-turn providers, ADR 0001). Stage card-effect preview runs on cloned state and players; a returned flow or a detectable clone mutation marks the activation applicable. Real mutation happens only after the player selects it.
- **Stage Dispatch**: preparation windows (`onBeforeStartOfTurn`, `onAfterRevealAction`, `onPreparation`, `onRoundStart` = StartOfTurn, `onEndPreparation`, `onBeforeWork`, `onWorkStart`), turn end, `onBeforeHarvest`, the three Harvest field hooks and before-end use the same `activate-card-effect` model. Each window freezes its player order (clockwise from the Start Player Marker where the rule requires it) and captures a player's eligible sources only on that player's entry through the pure `stageEligibility` query. Discovery never filters by current affordability; live cloned preview decides applicability, payment and mandatory / pass state after each selection.
- The fixed source tree survives purchases, passing, anytime actions, pending restoration and undo. Completed sources never replay; cards played inside a window join only later windows. Window context, player order and cursor are part of the recoverable stage continuation and are never reread from a changed marker.
- **StartOfTurn** combines a player's scheduled receipts, offers, actions and card activations in one tree; receipt-dependent bonuses keep their dependencies, and resolved facts follow actual receipt. Accumulation follows Preparation, work order freezes before StartOfTurn, and first-round setup uses the same chain and accumulates once.
- **Before-Harvest** runs before Harvest skips apply, so every player participates; each target player resolves only their own activations.
- **Turn end** shares source discovery between ordinary rotation and card-driven Turns, including explicitly retained timed obligations. The multi-source selector opens its own anytime window; permission stays local to that waiting node.
- **Own play and completion are separate**: a one-time own-play benefit runs in `onBuy` after payment and commitment, and a played card does not match its own direct `occupation` / `improvement` trailing reactions. Other cards and owners still react, and the new card counts in the trigger snapshot.
- The `during` phase is retired; successful-host trailing reactions are `immediatelyAfter` and `after`. Workshop validation rejects unsupported phases instead of translating them.
- Native hook vocabulary does not automatically extend the Workshop allowlist.

## Consequences

- Players choose source and order for same-timing reactions, as in the reference.
- Extra-turn providers coexist; undo re-derives trigger-select from restored state instead of storing old options.
- Handlers must return replayable flows. Serial stages not yet migrated keep their own continuation; new stage abilities should use the activation model.
- Tests assert trigger-select, source selection, pass / mandatory gates and undo re-derivation, never automatic execution in play-zone order.

## Alternatives considered

- Keeping the per-card opt-in: easy to forget and inconsistent with the reference default.
- Keeping the hand-written Harvest field split: turns the dispatcher into a rule-adjudication layer.
- First-match extra turns: hides later providers.
- A global skipped-provider queue: per-source counters already express consumed opportunities.
