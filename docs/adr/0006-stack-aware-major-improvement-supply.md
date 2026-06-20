# Six-player major improvements use stack-aware supply

- Status: Accepted
- Date: 2026-06-19

The 6-player expansion adds duplicate major improvements that are physical card copies, not aliases, and some of them are covered until the visible copy is bought. We will model the board as a stack-aware major improvement supply while keeping `availableMajorImprovements` as the current top-card compatibility list, because a flat list would either expose covered cards too early or lose the return-to-board order needed by Fireplace/Cooking Hearth upgrades.

The rejected alternative was to append all duplicate major ids to the existing flat supply. That would be simpler, but it would make hidden covered cards purchasable and would leave later return/upgrade behavior dependent on ad hoc ordering rules.
