# 6. Major improvement supply is stack-aware

- Status: Accepted
- Date: 2026-06-19

## Context

The 6-player expansion adds duplicate major improvements that are physical card copies, some covered until the visible copy is bought. Returning a Fireplace or Cooking Hearth to the board during an upgrade must restore the right position.

## Decision

- The board is a stack-aware major improvement supply; variant templates select the stacks. `availableMajorImprovements` remains the compatibility list of current top cards.
- Purchase, return and swap go through supply helpers, and production reads use supply query helpers rather than editing the flat list.
- Duplicates keep their concrete card IDs as source, exchange source and scoring attribution.

## Consequences

- Covered cards are never purchasable early, and return order is defined by the stack.

## Alternatives considered

- Appending every duplicate ID to the flat supply: simpler, but exposes covered cards and leaves return and upgrade behavior to ad hoc ordering.
