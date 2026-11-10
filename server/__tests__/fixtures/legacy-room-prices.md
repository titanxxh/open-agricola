# Legacy room-price recovery fixtures

`legacy-room-prices.json.gz` contains five complete snapshots produced by public `GameSession` commands on commit `f4a112409241c973c501723a6c6ac8b8537b8c85`, seed 1636. It preserves the authoritative state, public frame, private cursor and recovery history produced by `serializeSessionSnapshot`.

The scenarios stop at self-build geometry selection, self-build payment selection, partner payment selection, a source-granted free room, and an already-paid room awaiting player handoff. No pending node or payment option was inserted by hand.

To regenerate, create a detached checkout of the predecessor under `.worktree/`, install its dependencies, and copy the current `scripts/fixtures/generate-legacy-room-prices.ts` into the same path in that checkout. Run it from the predecessor checkout:

```bash
pnpm run build:cards-manifest
pnpm exec tsx scripts/fixtures/generate-legacy-room-prices.ts /absolute/path/to/legacy-room-prices.json.gz
```

The generator refuses a different commit. The recovery tests load each fixture directly and after another serialize/restore cycle, then execute the next real command. Settled resources remain unchanged; unpaid menus use the current legal prices.
