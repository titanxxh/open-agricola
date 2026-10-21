# ADR 0033: Card listener timing follows the reference implementation

Status: Accepted. Maintainer decision of 2026-10-20, recorded in [#1315](https://github.com/titanxxh/open-agricola/issues/1315).

## Context

[ADR 0031](0031-explicit-action-space-use-subscriptions.md) decides what a listener subscribes to. It does not decide whether the reaction runs `before`, `immediatelyAfter` or `after` its host. Most card texts say only "each time". OA had put many space-use rewards on `after`, so the reward could not be used in the action that produced it. The reference implementation grants such rewards at placement, before it inserts the space's own flow (`Actions/PlaceFarmer.php:173` and `:201`). No test locked the timing.

An inventory of decks A–E against the reference found a consistent split among "each time" cards without printed timing. Rewards for using a space mostly run before the host (90 before, 20 after). Reactions to performing an action mostly run after it (8 before, 74 after), because their effects often depend on its result.

## Decision

- For a card the reference implements, the listener phase follows the reference handler. Handlers the reference marks for removal and never runs do not count.

  | Reference handler | Runs | OA phase |
  |---|---|---|
  | `onPlayerPlaceFarmer` / `onOpponentPlaceFarmer` | at placement, before the space's flow | `before` |
  | `onPlayerBefore<Action>` | before the host action | `before` |
  | `onPlayer<Action>`, such as `Collect`, `Gain`, `Receive`, `Sow` or `Exchange` | after the host mutation | an after-type phase |
  | `onPlayerImmediatelyAfter<Action>` | before ordinary after reactions | `immediatelyAfter` |
  | `onPlayerAfter<Action>` | after the host | `after` |

- The relative order of the reference's immediately-after and after reactions is kept. OA adds no `during` phase.
- Where OA reaches the reference's effect through another mechanism, such as a doability or replacement query instead of a reaction, the effect must match, not the hook.
- For a card the reference does not implement, including Farmers of the Moor cards, printed timing decides: "immediately before" or "before" is `before`, "immediately after" is `immediatelyAfter`, and "after" is `after`. Without printed timing, the card follows the reference's convention:

  | Card text | OA phase | Evidence from implemented cards |
  |---|---|---|
  | An extra benefit for using a space (also get, can buy, can exchange) that does not depend on the action's result | `before` | 70 before, 5 after |
  | Taking at least N goods from an accumulation space | `after` | 7 after, 2 before |
  | Performing an action: plowing, building, renovating, fencing, sowing, family growth or exchanging for food | `after` | 74 after, 8 before |
  | An extra benefit for taking a Moor Special Action | `before` | The reference has no Moor cards; by analogy with using a space |

- Workshop custom cards have no reference implementation and apply the same convention within the Workshop subset.

## Consequences

A `before` reward is usable within the same host action. Core current-step admission also permits a space when the first executable step of an applicable `before` flow can start, even if the host cannot currently execute. It does not simulate the reward or prove that the host will become executable. Per the maintainer decision of 2026-10-21, cards add no admission guard or redundant `isDoable` override for this case. A false positive can enter `engine-blocked`, and the player must undo it. Empty accumulation spaces retain their structural entry condition.

Card tests assert what each phase promises. For `before` they show that the reward is usable inside the same host action. For `immediatelyAfter` and `after` they show the order relative to other reactions at the same completion. Both also cover the cases that must not trigger.

Rule authority stays with card text, official rulings and recorded maintainer decisions. This decision adopts the reference's timing as the rule for unspecified timing; other reference platform fields still do not drive OA behavior.

The phase semantics and current-step admission are in [Hooks, stage dispatch and listener purity](../architecture/hooks.md). Test expectations are in the [card testing template](../CARD_TEST_TEMPLATE.md), and Workshop guidance is in section 5.5 of the [custom card sandbox reference](../CUSTOM_CARD_SANDBOX.md).
