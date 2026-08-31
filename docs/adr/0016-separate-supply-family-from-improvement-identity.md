# Separate supply family from improvement identity

- Status: Accepted
- Date: 2026-08-31

Major improvement supply family records a physical card's stack or row on the supply board, while improvement identity records the explicit rule meaning that a card counts as a named improvement or its upgrade. We keep these concepts separate because expansion replacements can occupy a base improvement's stack without inheriting its named rules identity; rules about supply position use the family, while rules about named improvements or upgrades require explicit identity metadata.

The rejected alternative was to infer rule identity from supply family or card-id prefixes. That is shorter locally, but it incorrectly treats cards such as Furniture Stall as Joinery upgrades and cannot express independently designed replacement and dual-type cards reliably.
