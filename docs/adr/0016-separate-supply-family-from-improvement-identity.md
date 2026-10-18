# 16. Supply family is separate from improvement identity

- Status: Accepted
- Date: 2026-08-31

## Context

Expansion replacements can occupy a base improvement's supply stack without inheriting that improvement's named rules identity. Inferring identity from the stack treated unrelated cards, such as Furniture Stall, as Joinery upgrades.

## Decision

- A major improvement's supply family records only its physical stack or row on the supply board.
- Improvement identity, meaning that a card counts as a named improvement or its upgrade, is explicit `*Identity` metadata read through `playerHasCardCapability()` or a card-definition lookup.
- Rules about supply position use the family; rules about named improvements or upgrades use identity.

## Consequences

- Replacement and dual-type cards express their identity independently of where they sit.

## Alternatives considered

- Inferring identity from supply family or card-ID prefixes: shorter locally, but wrong for replacement and dual-type cards.
