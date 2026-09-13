# Resource commitments preserve unsettled trades without prepayment

- Status: Accepted
- Date: 2026-09-13

A player who starts a sale or accepts a purchase commits the required resources without transferring them before settlement. The authoritative command boundary rejects changes that would break a live commitment; a completed trade transfers both sides atomically and releases every participant's commitment. This preserves the other players' accepted decisions without early payment and refund flows.

Resource Commitment is separate from Continuation Guard: participants may still take legal anytime actions that preserve committed resources, including obtaining food before accepting a purchase. The existing mandatory-continuation and protected-observation restrictions remain unchanged. Feeding is settled player by player so a pending participant's inventory is not spent before their feeding step.
