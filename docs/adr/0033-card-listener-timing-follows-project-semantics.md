# ADR 0033: Card listener timing follows project semantics

Status: Accepted. Revised by maintainer decision of 2026-10-31. This replaces the reference-handler timing policy adopted on 2026-10-20 in [#1315](https://github.com/titanxxh/open-agricola/issues/1315).

## Context

[ADR 0031](0031-explicit-action-space-use-subscriptions.md) separates Rule Action, Action Space Use and person-placement subscriptions. OA represents their timing through lifecycle boundaries, listener phases and player-controlled Reaction Windows.

Reference implementations can use different event names, nested flows and platform mechanisms to express a card. Mapping their handler names directly to OA phases makes those implementation choices determine OA's reaction order. The required card behavior must instead be expressed through OA's own architecture.

## Decision

- Card text, official rulings and recorded Project Rule Interpretations establish the required behavior. Choose the subscription target from the triggering fact and the phase from that behavior within OA's lifecycle. Reference handler names and flow nesting do not select the phase.
- Use the existing phases according to their OA meaning:

  | OA phase | Meaning at the subscribed host |
  |---|---|
  | `before` | Runs before the host executes. A granted reward is available for that host's costs and choices. |
  | `immediatelyAfter` | Runs after the host result exists, in its immediate completion window. |
  | `after` | Runs in the ordinary completion window, after the immediate window at the same completion boundary. |

- Explicit printed timing constrains the phase. When timing is unspecified, use the required resource availability, result dependencies and established OA behavior for equivalent triggers. Record a Project Rule Interpretation when the available rules leave a material ambiguity.
- Sources belonging to the same Reaction Window use the existing owner and trigger-select scheduling. Players choose their own source order, and remaining sources are evaluated against current state after each selection. A temporarily unavailable source can become available after another source supplies resources. A requirement that permits a valid player-chosen order does not imply an engine-enforced order.
- Space-use and rule-action sources may share a completion window without changing their subscription identities. Express the required order using existing phases and player choice before adding another timing mechanism or a fixed card order. OA adds no `during` phase.
- BGA and other reference implementations provide comparison evidence and edge cases. Their handlers, relative callback order and platform mechanisms do not override OA's phase semantics. This policy applies equally to official cards, Farmers of the Moor cards and Workshop cards within the supported Workshop subset.

## Consequences

A `before` reward is usable within the same host action. Core current-step admission also permits a space when the first executable step of an applicable `before` flow can start, even if the host cannot currently execute. It does not simulate the reward or prove that the host will become executable. Per the maintainer decision of 2026-10-21, cards add no admission guard or redundant `isDoable` override for this case. A false positive can enter `engine-blocked`, and the player must undo it. Empty accumulation spaces retain their structural entry condition.

Card tests assert observable OA behavior. For `before` they show that the reward is usable inside the same host action. Completion tests show phase order, player-chosen order and reevaluation when one source enables another. They also cover non-triggering cases, pending state and recovery where applicable. A reference callback name or an existing implementation-specific ordering test is not a rule authority.

This revision changes the phase-selection policy. It does not claim that all existing card timings have been audited or migrated. Each behavior change needs its own rule justification and focused verification.

The phase semantics and current-step admission are in [Hooks, stage dispatch and listener purity](../architecture/hooks.md). Test expectations are in the [card testing template](../CARD_TEST_TEMPLATE.md), and Workshop guidance is in section 5.5 of the [custom card sandbox reference](../CUSTOM_CARD_SANDBOX.md).
