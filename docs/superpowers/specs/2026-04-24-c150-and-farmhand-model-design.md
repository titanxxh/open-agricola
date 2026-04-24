# C150 ParrotBreeder + B85 FarmHand model (→ D102 / E76) — BGA alignment

**Status:** design approved (pending final review), ready for implementation
**Scope:** two independent subprojects in one spec — implemented as two commits
**Related §:** `docs/card_progress.md` §2.2 removes C150 + D102/E76 rows;
§2.1 gains C150 / B85 / D102 / E76.

## 1. Why

`card_progress.md` §2.2 currently lists three simplified implementations:

- **C150 ParrotBreeder** — the current listener just pays 1 grain and
  immediately gains 1 grain (net zero). It never tracks the right
  neighbour's place-farmer action and never offers the copied
  action-space option. Effectively a placebo.
- **D102 / E76** — both let the player return a stable for resources,
  but skip the FarmHand-stable branch because B85 FarmHand in our
  model doesn't have a distinct tile.
- **B85 FarmHand** — currently pays 2 wood + increments `player.rooms`
  through a custom `build-farmhand-room` action. No tile placement,
  no integration with existing housing / stable logic, not returnable.

The two concerns (C150 cross-player tracking vs B85 tile model) are
architecturally independent. They ship in one spec because the user
scoped them together, but the work decomposes into separable commits.

## 2. Subproject A — C150 ParrotBreeder

### 2.1 Card text

> On your turn, if you pay 1 <GRAIN> to the general supply, you can
> use the same action space (unless it is the __Meeting Place__ action
> space) that the player to your right has just used on their turn
> (not retroactive).

### 2.2 BGA reference

From `B85_FarmHand.php` sibling file
`bga-agricola/modules/php/Cards/C/C150_ParrotBreeder.php`:

- `onPlayerAfterPlaceFarmer`: clear `right` tracker, unflag.
- `onOpponentAfterPlaceFarmer`: if the placing opponent is the
  right-neighbour (seat position − 1, wrapping to the last seat), set
  `right = event.actionCardId`. Else clear. Unflag regardless.
- `onPlayerAtAnytime` (during Work Phase while unflagged): `SEQ {
  flag, pay grain 1 }`.
- `onPlayerComputeArgsPlaceFarmer`: if flagged AND `right` set AND
  `right` is not Meeting Place, inject an extra option
  `{ actionCardId: right, playerConstraint: 'dummy' }` — the
  `dummy` constraint lets the player place on the tracked space even
  though it is still occupied.

### 2.3 Existing infrastructure we reuse

- `scope: 'any' | 'self' | 'opponent'` on
  `CardListenerRegistration` (`shared/cards/card-listeners.ts`).
- `phases: ['after']` + `actions: ['place-farmer']` fires reliably for
  both own and opponent placements.
- `phases: ['computeArgs']` + `actions: ['place-farmer']` is already
  used by 8 cards (A25/A28/A87/A94/A130/B129/B151/C129/D24/D112/E129/
  E150) to inject `OCCUPIED_SPACE_CHOICE_PREFIX` options via
  `computeAllowedPlacementSpaces`. C150 becomes one more consumer.
- `phases: ['anytime']` for the "pay grain to arm the next place-farmer"
  step.
- `CardEffect.onBeforeStartOfTurn` — currently used to clear the flag
  at round start (retained as a safety net).

### 2.4 Our implementation

All four listeners live in `shared/cards/C/C150_ParrotBreeder.ts` — no
engine or session changes.

**State** (`cardStates.C150_ParrotBreeder`):

- `flags.flagged: boolean` — grain paid, awaiting next place-farmer.
- `extraData.right: string | null` — tracked space id from the last
  right-neighbour placement.

**Listener 1 — `after: place-farmer` scope `any`:**

```ts
handler: (ctx) => {
  const owner = ctx.player          // card owner (scope=any still gives owner)
  const placer = ctx.placingPlayer  // whichever player just placed
  const ownerIdx = ctx.state.players.findIndex(p => p.id === owner.id)
  const rightIdx = (ownerIdx - 1 + ctx.state.players.length) % ctx.state.players.length
  const rightId = ctx.state.players[rightIdx].id

  setCardFlag(owner, CARD_ID, false)

  if (placer.id === owner.id) {
    setCardExtraData(owner, CARD_ID, { right: null })
  } else if (placer.id === rightId) {
    setCardExtraData(owner, CARD_ID, { right: ctx.space.id })
  } else {
    setCardExtraData(owner, CARD_ID, { right: null })
  }
}
```

Seat order in our state is `state.players` array order (this matches
how D50 ForeignAid and other cross-player cards already read seat
positions). C150 requires 4+ players so the "right-neighbour" case
is always meaningful.

**Listener 2 — `anytime` phase (scope self):**

```ts
handler: (ctx) => {
  if (isCardFlagged(ctx.player, CARD_ID)) return
  if ((ctx.player.resources.grain ?? 0) < 1) return
  if (ctx.state.roundPhase !== 'work') return
  return {
    flow: { type: 'seq', children: [
      payLeaf({ cardId: CARD_ID, cost: { grain: 1 } }),
      { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
    ]},
    sourceCard: CARD_ID,
    labelKey: 'cards.C150_ParrotBreeder.anytime',
  }
}
```

No `gainLeaf` — the existing `gain 1 grain` in the current
implementation was a placebo bug.

**Listener 3 — `computeArgs: place-farmer` scope self:**

```ts
handler: (ctx) => {
  if (!isCardFlagged(ctx.player, CARD_ID)) return
  const right = ctx.player.cardStates?.[CARD_ID]?.extraData?.right
  if (typeof right !== 'string') return
  if (right === 'meeting-place') return
  return {
    extraOptions: [{
      value: `${OCCUPIED_SPACE_CHOICE_PREFIX}:${right}`,
      labelKey: 'ui.interactionC150UseRightSpace',
      sourceCard: CARD_ID,
    }],
  }
}
```

The existing `computeAllowedPlacementSpaces` +
`OCCUPIED_SPACE_CHOICE_PREFIX` path will let the player place on that
space even when its `takenBy` is non-empty.

**CardEffect.onBeforeStartOfTurn** — retain a defensive
`setCardFlag(player, CARD_ID, false)` + `setCardExtraData(player,
CARD_ID, { right: null })` at round start so nothing leaks across
rounds even if a place-farmer event is somehow missed.

### 2.5 Intentional deviation

None beyond the project-wide "no listener ordering" principle.

### 2.6 Tests

`server/__tests__/C150_ParrotBreeder-session.test.ts` — new file, 4-
player session (required by C150's `players: '4+'`):

1. **Track right-neighbour** — right neighbour takes `forest`. Owner
   reads `cardStates.C150_ParrotBreeder.extraData.right === 'forest'`.
2. **Pay grain + place on right's space** — owner takes `anytime`
   C150 → grain −1, flagged. Owner takes `place-farmer` on `forest`
   via injected option even though `forest.takenBy.length === 1`.
   Owner ends on `forest`; right-neighbour worker still there; owner
   gets the space's resources; flag cleared.
3. **Meeting Place excluded** — right neighbour takes `meeting-place`.
   Owner pays grain → options for place-farmer do NOT include a
   second meeting-place entry.
4. **Non-right insertion clears tracker** — seq R → non-R opponent
   places → right tracker is null; owner's computeArgs injects
   nothing.
5. **Owner's own place clears both** — owner places normally after
   arming → flag + right both cleared.
6. **Not enough grain / already flagged** — anytime listener does not
   emit the offer.

## 3. Subproject B — B85 FarmHand model (+ D102 / E76)

### 3.1 Card text (B85)

> Once this game, if you have 4 field tiles in a 2x2, you can build a
> stable in the center of the 2x2 **during a Build Stables action**.
> This stable provides room for a person but not animals.

BGA official rulings:

- "You can only build the Farm Hand stable **during a Build Stables
  action exactly**, which does not include cards such as
  __Lazybones__ (E148) or __Stable Planner__ (A089) that only let
  you build a stable."
- "You can return the Farm Hand stable using __Sample Stable Maker__
  (D102) or __Lumber Pile__ (E076). If you do, any person who was
  living in the Farm Hand stable moves into your other rooms."

### 3.2 Data model

Only new persistent state lives in `cardStates.B85_FarmHand`:

- `extraData.position?: FarmTilePosition` — **top-left field** of the
  2×2 block the FarmHand stable sits at. Stored only when built.
  Cleared by D102 / E76 when returned.
- `flags.used: boolean` — once-per-game sentinel. Stays true even
  after D102/E76 returns the tile (BGA: "Once this game").

Housing contribution is **not** a new field — B85 exposes a
`computeExtraRoomCapacity` implementation (see §3.4).

### 3.3 Housing integration — reuse existing `computeExtraRoomCapacity`

The engine already aggregates per-card room bonuses via
`CardEffect.computeExtraRoomCapacity(player): number`
(`shared/cards/card-effects.ts:157`). Six cards already use it:
A10/A85/A127/C10/D85/E85. B85 joins them with:

```ts
effect: {
  id: CARD_ID,
  computeExtraRoomCapacity: (player) =>
    getFarmHandPosition(player) ? 1 : 0,
  // ...
}
```

where `getFarmHandPosition(player)` is a file-local helper reading
`player.cardStates?.B85_FarmHand?.extraData?.position`.

Consequences:

- `wish-children.ts`'s `effectiveRooms(player) = player.rooms +
  getExtraRoomCapacity(player)` automatically includes the FarmHand
  slot. No change to main path.
- `player.rooms` itself is **not** incremented. Renovation cost,
  scoring, D34 Stone-House bonus all stay correct because they read
  `player.rooms` directly.
- After D102/E76 returns FarmHand, `computeExtraRoomCapacity` drops
  back to 0 — capacity naturally shrinks. If the drop leaves
  `familySize > effectiveRooms`, the player simply can't grow family
  again until they build more rooms (same behaviour as a regular
  stable removal). This is the "move to other rooms" BGA ruling
  expressed via capacity rather than relocation UI. Recorded in §3.6
  as a deliberate simplification.

### 3.4 B85 — Build-Stables-only trigger

Keep the existing `anytime` listener shape; tighten the guard:

```ts
handler: (ctx) => {
  if (isCardFlagged(ctx.player, CARD_ID)) return            // used this game
  if (ctx.space?.id !== 'stables') return                   // exact Build Stables only
  if (ctx.player.resources.wood < 1) return                 // BGA cost: 1 wood
  const candidates = getFarmHandCandidates(ctx.player)
  if (candidates.length === 0) return
  return {
    flow: { type: 'seq', children: [
      payLeaf({ cardId: CARD_ID, cost: { wood: 1 } }),
      { type: 'leaf', actionId: 'selection',
        sourceCard: CARD_ID,
        actionContext: {
          selectionKind: 'farm-position',
          selectionEffect: FARM_HAND_SELECT,
          maxSelections: 1,
          minSelections: 1,
          selectableTiles: candidates,
        } },
      { type: 'leaf', actionId: 'flag-card', sourceCard: CARD_ID },
    ]},
    sourceCard: CARD_ID,
    labelKey: 'cards.B85_FarmHand.anytime',
  }
}
```

- Cost: BGA's `canAffordStablePlan(…, 1)` with 1 wood per normal
  stable → our guard demands 1 wood and `payLeaf` charges 1 wood.
  (Earlier simplified impl demanded 2 wood — that was wrong.)
- `getFarmHandCandidates(player)`: iterate all `(r, c)` with
  `0 ≤ r ≤ FARM_ROWS−2` and `0 ≤ c ≤ FARM_COLS−2`; keep those where
  `(r,c)`, `(r,c+1)`, `(r+1,c)`, `(r+1,c+1)` are all fields of this
  player AND the 2×2 block does not already host a FarmHand stable
  (once-per-game; `flags.used` covers it).
- `ctx.space?.id !== 'stables'` guard: `ctx.space` is the current
  active action space on anytime listeners. When the player enters
  `farm-expansion` and chooses the `stables` branch, the active leaf
  space is `'stables'`. Lazybones (E148) and Stable Planner (A089)
  generate stables via their own actions (not `'stables'`), so the
  guard naturally excludes them — matching the BGA ruling.

`SelectionEffect` handler `FARM_HAND_SELECT`:

```ts
registerSelectionEffect(FARM_HAND_SELECT, ({ player, positions }) => {
  const [rowStr, colStr] = positions[0].split('-')
  const row = Number(rowStr)
  const col = Number(colStr)
  setCardExtraData(player, CARD_ID, { position: { row, col } })
})
```

The `flag-card` leaf at the end sets `flags.used = true`. Once-per-
game.

### 3.5 D102 / E76 — return candidates include FarmHand

Both cards already consume `shared/cards/helpers/stable-removal.ts`.
Expand that file into the **single abstraction layer for "returnable
stable tiles"** so callers never touch the FarmHand storage directly.
A single inspection of our cards + BGA cards confirms D102 and E76
are the only consumers; future "return a stable" cards should also
route through this helper.

Extended `shared/cards/helpers/stable-removal.ts`:

```ts
// existing — kept as-is
removeStableAtTile(player, tile): boolean
countRemovableStables(player): number  // normal stables only, retained

// new — union of normal + FarmHand positions, for selection candidates
listReturnableStableTiles(player: PlayerState): FarmTilePosition[] {
  const result = player.stableTiles.map(t => ({ row: t.row, col: t.col }))
  const fh = player.cardStates?.B85_FarmHand?.extraData?.position
  if (fh) result.push({ row: fh.row, col: fh.col })
  return result
}

// new — dispatches to the right storage; returns which kind was removed
removeStableOrFarmHandAtTile(
  player: PlayerState,
  tile: FarmTilePosition,
): 'normal' | 'farmhand' | null {
  const fh = player.cardStates?.B85_FarmHand?.extraData?.position
  if (fh && fh.row === tile.row && fh.col === tile.col) {
    delete player.cardStates.B85_FarmHand.extraData.position
    return 'farmhand'
  }
  return removeStableAtTile(player, tile) ? 'normal' : null
}
```

D102 / E76 both migrate:

```ts
// candidate listing
const selectableTiles = listReturnableStableTiles(player)

// selection-effect handler
const kind = removeStableOrFarmHandAtTile(player, tile)
if (kind === null) return  // tile no longer valid
// grant resources — identical payload regardless of kind
```

Gain payload stays card-specific:

- D102: `{ wood: 1, grain: 1, food: 1 }` per returned tile (only 1
  selection allowed per trigger).
- E76: `{ wood: 3 }` per returned tile, up to 3 selections.

### 3.5.1 Boundary protection — `cardStates.B85_FarmHand.extraData.position` encapsulation

The FarmHand tile position is stored on `cardStates.B85_FarmHand.
extraData.position`. The encapsulation rule is:

- **Owner**: `shared/cards/B/B85_FarmHand.ts` writes the position on
  build and exposes a file-local `getFarmHandPosition(player)` reader
  for its own `computeExtraRoomCapacity` hook and candidate listing.
- **Shared reader / mutator for cross-card return**:
  `shared/cards/helpers/stable-removal.ts` —
  `listReturnableStableTiles` and `removeStableOrFarmHandAtTile` are
  the only functions outside B85 that may read or clear the position
  field.
- **All other cards** (current and future): must not reference
  `cardStates.B85_FarmHand.extraData.position` directly. New
  "return-a-stable" cards route through the helper and remain
  FarmHand-agnostic.

A one-line assertion in the spec: if a future card needs to *read*
the FarmHand position without returning it, add a narrow reader to
`stable-removal.ts` rather than inlining the path.

### 3.6 Intentional simplification — "person moves to other rooms"

BGA's FarmHand-stable-return ruling says the occupant moves to
other rooms. We model this implicitly: `player.familySize` is
unchanged, and `effectiveRooms = player.rooms + getExtraRoomCapacity
(player)` recomputes naturally after the FarmHand bonus drops to 0.
No explicit relocation UI. Documented in `card_progress.md` §2.5.

### 3.7 Tests

- `shared/cards/__tests__/B85_FarmHand.test.ts` (new) — unit tests for
  `getFarmHandCandidates`: no fields / one field / 3 in an L / valid
  2×2 / two overlapping 2×2 blocks / existing FarmHand blocking re-use.
- `server/__tests__/B85_FarmHand-session.test.ts` (update existing)
  - **Trigger only inside `stables`** — anytime offer absent on
    `place-farmer` at `forest`; absent at `E148 Lazybones`'s stable
    flow; present when player enters `farm-expansion → stables`.
  - **Full build flow** — 2-player session, player has valid 2×2,
    enters farm-expansion → stables → anytime B85 → selection →
    commit; assert `cardStates.B85_FarmHand.extraData.position`,
    `flags.used`, `wood − 1`.
  - **Once per game** — second attempt after a D102 return still
    rejected (because `flags.used === true` even though position is
    cleared).
  - **Housing bonus** — after FarmHand built, `effectiveRooms(player)`
    is `rooms + 1`; family growth succeeds when rooms alone would
    block.
- `server/__tests__/D102_SampleStableMaker-session.test.ts` (update)
  - **Return FarmHand** — player has FarmHand + 0 normal stables;
    D102 fires at start of return-home; selection lists FarmHand
    tile; returning it clears `extraData.position` and grants
    `{ wood: 1, grain: 1, food: 1 }`.
- `server/__tests__/E76_LumberPile-session.test.ts` (update)
  - **Return mixed** — 2 normal stables + 1 FarmHand; E76 onBuy
    allows all three; resources `+9 wood`; FarmHand cleared.

### 3.8 Out of scope

- The BGA flow-wrapping (`wrapStablesWithFarmHandIfPlayed`) approach
  of nesting stables into an OR. Our guarded `anytime` achieves the
  same player-visible behaviour and is simpler. If a future card
  genuinely needs flow-wrapping, add it then.
- Explicit "relocate occupant" UI on FarmHand return.
- FarmHand tile in scoring (treated like any non-room, non-stable
  entity — no score).

## 4. Documentation sync (§1–§7)

`docs/card_progress.md`:

- §2.0 — append 2026-04-24 entry with summary and a pointer to this
  spec.
- §2.1 — add rows for C150 / B85 / D102 / E76 (count 28 → 32).
- §2.2 — remove C150 and D102/E76 rows (3 → 1 remaining: only
  C150's simplification was still listed separately; after this PR
  §2.2 shrinks to just `D102/E76 skip …` removed too).
- §2.5 — add "FarmHand occupant relocation on return is implicit via
  room capacity rather than an explicit UI step".

`docs/superpowers/specs/2026-04-24-c150-and-farmhand-model-design.md`
— this file — committed with the first implementation commit.

## 5. Acceptance criteria

1. C150 ParrotBreeder:
   - Anytime offer appears only during Work Phase when the card owner
     has ≥ 1 grain and isn't flagged.
   - Taking the anytime offer pays 1 grain (no grain gain).
   - When right-neighbour has placed a worker on a non-Meeting-Place
     space and C150 is flagged, the owner's next place-farmer lists
     that space as an option even when occupied.
   - Tracker + flag clear correctly on own place / non-right opponent
     insertion / round boundary.
   - File length ≤ 120 lines; no changes outside the C150 file.

2. B85 FarmHand / D102 / E76:
   - B85 offer appears only when `ctx.space.id === 'stables'`, costs
     1 wood, and requires a valid 2×2 block.
   - Built FarmHand contributes 1 to `getExtraRoomCapacity(player)`
     and does not change `player.rooms` or animal logic.
   - D102 / E76 list the FarmHand tile alongside normal stables and
     clear `extraData.position` on return.
   - `flags.used` blocks re-use even after D102/E76 returns the
     FarmHand.
   - No new engine phase / action registered.

3. All existing `pnpm test:fast` / `:slow` tests pass; new tests
   pass; `pnpm run build` + `pnpm run lint` clean.

4. `docs/card_progress.md` updated per §4.
