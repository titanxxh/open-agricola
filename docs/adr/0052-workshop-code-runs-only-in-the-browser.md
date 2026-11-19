# 52. Workshop code runs only in the browser; multiplayer uses merged cards

- Status: Accepted
- Date: 2026-11-20
- Tracking: [#1887](https://github.com/titanxxh/open-agricola/issues/1887)
- Supersedes: [ADR 0025](0025-workshop-capability-contract-is-fail-closed-and-opened-by-tests.md)

## Context

ADR 0025 limited Workshop cards to a fail-closed Workshop Capability Contract. The server executed approved Workshop code in isolated-vm. That boundary was needed for one case only: an approved card that had not been merged, running in another player's Room. The boundary also passed every input and result through JSON. Native mechanisms that return functions or change state in place therefore could not be offered (the second group in #1079). Each further capability needed its own slice and test, so what a card could do was limited by the contract rather than by the model or the engine.

On 2026-11-19 production had no live or approved Workshop card, no public version and no Room with custom cards. None of its 1441 retained creation configurations listed `customCardIds` or enabled the community deck.

## Decision

- **Execution.** Unmerged Workshop code runs only in the author's browser, in an opaque-origin sandboxed iframe with a fresh Worker and a CSP that blocks network access. This covers both the model's behavior tests and the author's playtests. Browser origin isolation is the security boundary; source analysis is not. The server never executes Workshop code. isolated-vm, the server custom-code executor and the executable Workshop Room path are removed.
- **Multiplayer.** Rooms, solo and hotseat games and Replays use only the cards in the deployed build. A Workshop card reaches other players only after its pull request merges and a release deploys it as a community card. The community-deck option selects those merged cards. Approval no longer makes a card live, and creation no longer accepts `customCardIds`.
- **Source shape.** Workshop source is the Card Source module that its pull request adds at `shared/cards/community/<CARD_ID>.ts`. It imports from `shared/` and exports a `defineMinorCard` or `defineOccupationCard` definition. The browser resolves those imports to the Worker's own engine modules, so a Workshop card has the same objects and semantics as a native card. No JSON copy sits between them. Pull-request generation commits the authored source and adds the registry, catalog and index entries.
- **No capability contract.** A card may use any mechanism in the code it was written against, under the repository's card rules: it stays within its own file, changes no core path and adds no hook point. Admission checks structure only: a single module whose imports resolve to non-test files under `shared/`, with the required exports and a definition that matches the card's identity. A mechanism missing from the deployed engine surfaces as a failing test or playtest. Repository CI on the pull request is the merge gate.
- **Generation.** A Generation Attempt first researches the code at its pinned commit, starting from `docs/ARCHITECTURE.md`, then reports a feasibility verdict through a tool:
  - `feasible` unlocks writing source and tests;
  - `needs-info` asks the author, who can answer in the conversation and ask for a new verdict;
  - `needs-platform` means the card needs a shared mechanism. The Workshop prefills a GitHub issue with the card requirement, the research evidence at the pinned commit and the gaps. The author submits it from their own GitHub account.

  The prompt names the documentation entry point and embeds no capability list. Behavior tests are two-player Session tests in the browser runtime. A candidate needs at least one passing `positive:` test and one passing `negative:` test.
- **Public source interface.** The version-1 public Workshop card interface and its publication registry are removed. They had no public version.
- **Existing drafts.** Drafts written in the `CARD_DEF` / `CARD_IMPL` sandbox format are converted once to Card Source by the normalization that pull-request generation already applies. A draft that fails conversion keeps its source text and needs a new Generation Attempt. Retained games, creation configurations and Replays have no Workshop cards, so they need no migration. An absent or empty `customCardIds` in an old configuration is ignored.

## Consequences

- Workshop cards can use native mechanisms without per-capability slices. #1079 closes.
- The security boundary moves to browser origin isolation. Unmerged code runs only in the browser of the author who authored it.
- Playing a Workshop card with other people waits for the merge and the next release.
- The model's browser tests are evidence, not proof. Correctness for other players rests on pull-request review and CI.
- Production images no longer build or check the isolated-vm native module.

## Supersedes and amends

- ADR 0025 is superseded entirely.
- ADR 0008: the lines on Workshop phase validation and the Workshop allowlist no longer apply.
- ADR 0010: formal games no longer load Workshop cards, so they carry no Replay Card Snapshot of one.
- ADR 0014 and ADR 0022: executable Workshop Rooms, and the session Worker and code Worker they used, no longer exist.
- ADR 0047: isolated-vm is no longer a native dependency.

## Alternatives considered

- Keeping isolated-vm for approved but unmerged cards: this keeps the JSON boundary and the per-capability contract for a case that had no users.
- Widening the contract by #1079 slices: every mechanism still needs host-side settlement before it can open, so the gap stays.
