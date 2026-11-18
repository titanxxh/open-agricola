# Legacy Garden Designer scoring fixtures

`legacy-garden-designer.json.gz` contains two snapshots generated on `cabe56980e1a587a2b62efadf0413910acbd974f`, seed 5099, through public `GameSession` commands. A new two-player work fixture completes the final harvest with three empty fields and ten food for the card owner. `pending` preserves all ten original options and the engine cursor; `settled` records the subsequent nine-food, five-point payment and completed game.

To regenerate, copy `scripts/fixtures/generate-legacy-garden-designer.ts` and `server/__tests__/_helpers/garden-designer.ts` into a detached checkout of that predecessor, then run:

```bash
pnpm exec tsx scripts/fixtures/generate-legacy-garden-designer.ts /absolute/path/to/legacy-garden-designer.json.gz
```

The generator checks the predecessor commit, unchanged rules and engine, and the ten-option menu. No pending node or option is inserted manually. Session and browser tests load the saved pending, refresh its options and submit a real choice; settled-state tests verify that recovery never repeats payment or scoring.
