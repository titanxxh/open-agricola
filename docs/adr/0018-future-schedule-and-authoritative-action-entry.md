# 18. Future schedules preserve targets and card action spaces use strict entry

- Status: Accepted
- Date: 2026-09-04

## Context

Scheduled rewards were clamped onto round 14 when their target fell outside the game, which invented rewards on the wrong round. Card-created Action Spaces could be entered whenever a generic projection allowed it, even when the card's own predicate failed. Granting a rule action sometimes expanded a whole named Action Space and attached its unrelated benefits.

## Decision

- A Future Schedule request is either an Exact Future Target or a Future Prefix. An exact target keeps its declared round and is discarded outside `current round < target <= 14`; a prefix keeps only its contiguous portion that still exists. The shared resolver never moves an out-of-range target to round 14; a card that needs another mapping states it at the call site.
- Card-created Action Spaces use Strict Action Entry by default: availability projection and authoritative `takeAction` enforce the same executable predicate. Standard composite Action Spaces opt in, because an OR flow may legitimately enter with an unavailable child and offer a skip or replacement.
- A card that grants a rule action invokes that action directly. Granting `family-growth` does not expand Wish for Children and does not inherit its minor-improvement branch.

## Consequences

- Scheduled identity stays visible, and late rewards do not collapse onto the final round.
- Card Action Spaces cannot be entered against their own rules.

## Alternatives considered

- Global round clamping: invents rewards on the wrong round.
- Strict entry for every Action Space: over-blocks composite actions.
- Expanding the named Action Space for a granted action: attaches unrelated benefits.
