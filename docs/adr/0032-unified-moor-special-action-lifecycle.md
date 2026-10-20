# ADR 0032: Unified Moor special-action lifecycle

Status: Accepted design. Implementation pending in [#1293](https://github.com/titanxxh/open-agricola/issues/1293).

## Context

Concrete Moor action IDs currently serve as both execution data and listener targets. Normal, borrowed, and card-granted actions enter different paths, and some granted paths omit before reactions. [ADR 0007](0007-farmers-of-the-moor-variant-runtime.md) keeps these actions distinct from action-space use.

## Decision

- Native listeners use one `moor-action` subscription identity. Concrete Moor IDs remain execution parameters, filter values, and event source facts.
- Every actual Moor Special Action passes through its before, body, and after lifecycle, including actions granted by cards. Taking a special-action card without executing an action creates no such lifecycle.
- The body completes its required payment, improvement choices, mandatory follow-ups, and animal handling before Moor after reactions run. Failed execution creates no successful after window.
- Capture eligible Moor after sources after the base action commits and before its follow-up flows. Keep those sources fixed while handlers read current state after all required processing. A source introduced by a follow-up does not join the original action's after window.
- At the same final body completion, terminal rule-action after reactions and Moor after reactions share the existing owner and trigger-select scheduler. Immediate reactions finish before ordinary after reactions. Only ready reactions that have not started can join this window. Earlier rule completions within a multi-step body retain their original timing.
- Payment, card commitment, onBuy processing, mandatory choices, and animal handling belong to the primary body. Terminal after reactions belong to the completion window. A selected reaction finishes its own follow-ups before the player chooses another reaction. Shared scheduling preserves each trigger's source snapshot, identity, and event receipts.

## Consequences

The source policy deliberately differs from the phase-entry capture used for action-space subscriptions in [ADR 0031](0031-explicit-action-space-use-subscriptions.md). It preserves the existing Moor eligibility boundary while allowing existing sources to observe fields, resources, and animal counts changed by follow-ups. This is a refactoring constraint, not a claim that an official ruling settles every newly played card interaction.

Moor and action-space use can share completion scheduling without sharing their domain identities. No action-space placement or use hook is synthesized for a Moor action, and nested actions keep their own facts and completion windows.
