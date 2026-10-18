# 19. Resource commitments preserve unsettled trades without prepayment

- Status: Accepted
- Date: 2026-09-13

## Context

A sale or purchase between players can stay open while other players respond. Paying early and refunding on failure would move resources before the trade settles; doing nothing would let a participant spend resources an accepted trade relies on.

## Decision

- A player who starts a sale or accepts a purchase commits the required resources without transferring them. Cards declare commitments through `computeResourceCommitments(state, owner)`, a read-only list of participant minima.
- The authoritative command boundary rejects any command that would break a live commitment and restores its checkpoint before publication. A completed trade transfers both sides atomically and releases every participant's commitment.
- Resource Commitment is separate from Continuation Guard: participants may still take legal anytime actions that keep committed resources, such as obtaining food before accepting a purchase. Mandatory-continuation and Protected Observation restrictions are unchanged.
- Feeding settles player by player, so a pending participant's inventory is not spent before their feeding step.

## Consequences

- Accepted decisions survive without early payment or refund flows.
- PaymentSolver does not reserve resources; commitments are checked only at the command boundary.

## Alternatives considered

- Prepay and refund: moves resources before settlement and needs compensating flows.
- Reserve inside PaymentSolver: spreads a trade-specific rule into every payment.
