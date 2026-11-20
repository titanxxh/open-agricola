# Custom Card Sandbox Reference

[English](CUSTOM_CARD_SANDBOX.md) | [中文](CUSTOM_CARD_SANDBOX_zh.md)

This reference describes where Workshop card code runs and what the server checks ([ADR 0052](adr/0052-workshop-code-runs-only-in-the-browser.md)). How to write a card is in the [card authoring guide](CARD_AUTHORING.md); the mechanisms are in the [architecture index](ARCHITECTURE.md).

Read this document if you maintain the Workshop generation prompt (`client/services/llm/generation/`), the Workshop editor, the browser sandbox (`client/local-sandbox/`), server validation, or local model acceptance (`docs/test/llm-card-gen.md`).

## 1. Source shape

Workshop source is the Card Source module that the card's pull request adds at `shared/cards/community/<CARD_ID>.ts`. It imports from `shared/` with paths relative to that file and exports exactly one `defineMinorCard({ meta, impl })` or `defineOccupationCard({ meta, impl })` named after the card. A Workshop card has the same objects and semantics as a native card: there is no capability list, injected helper set or JSON copy between the card and the engine.

## 2. Execution: only the author's browser

The server never executes Workshop code. Unmerged code runs only in the browser of its author:

- [`opaque-worker.ts`](../client/local-sandbox/opaque-worker.ts) starts a fresh engine Worker inside an opaque-origin sandboxed iframe. The frame's CSP blocks network access, and the Worker cannot reach the page's cookies, storage or DOM. This origin isolation is the security boundary; source analysis is not.
- [`worker-capabilities.ts`](../client/local-sandbox/worker-capabilities.ts) also removes network, storage and nested-Worker globals from the Worker as defense in depth.
- [`native-card-source.ts`](../client/local-sandbox/native-card-source.ts) transpiles the module and resolves its relative imports to the Worker's own bundled engine modules: `shared/{actions,contract,domain,engine,events,moor,parents,seasons,session,utils}/`, `shared/cards/*.ts` and `shared/cards/{helpers,action}/`. Other cards and test files cannot be imported.
- [`local-custom-card.ts`](../client/local-sandbox/local-custom-card.ts) registers the module's `impl` in the Session's card registry, exactly like a built-in card.

Playtests ([`worker-core.ts`](../client/local-sandbox/worker-core.ts)) and the model's behavior tests ([`card-test-runtime.ts`](../client/local-sandbox/card-test-runtime.ts)) both use this path. Behavior tests are two-player Sessions; an exception thrown by the card reaches the test that ran the command, as it would for a built-in card.

## 3. Server checks

The server checks structure only and stores the result as validation evidence:

- [`card-source-admission.ts`](../shared/custom-code/card-source-admission.ts) requires one exported definition named after the card, relative imports that resolve to the shared modules listed above, and a statically readable inline `meta` whose `id` is the card ID, with `deck: 'community'`, a non-empty `name` and a string `desc` array.
- [`workshop-draft-validation.ts`](../server/workshop-draft-validation.ts) applies that check to `POST /api/workshop/cards/validate-code`, ability adoption and draft saves. It records the transpiled module and the card definition read from `meta`; the draft's card definition must match it before publication or pull-request handoff.
- [`workshop-sandbox-contract.ts`](../server/workshop-sandbox-contract.ts) serves `GET /api/workshop/sandbox-contract`: format 2, runtime `browser-card-source`, and an id that hashes the deployed `shared/` source and dependency lockfile. A validation result is bound to that id and to the source fingerprint.

A mechanism that the deployed engine lacks surfaces as a failing behavior test or playtest. Repository CI on the pull request is the merge gate.

## 4. Other players

Rooms, solo and hotseat games and Replays use only the cards in the deployed build. A Workshop card reaches other players after its pull request merges and a release ships it as a community card. [`code-gen.ts`](../server/workshop-pr/code-gen.ts) turns the draft into the pull-request file: it adds the generated header and the `_impl` export the registry imports, moves translations into a language patch and sets the adopted artwork.

## 5. The retired sandbox format

Before ADR 0052, Workshop source declared `CARD_ID`, `CARD_DEF` and `CARD_IMPL` and ran against an allowlisted capability contract on the server. Nothing runs that format any more:

- The server rejects it with HTTP 400 and code `legacy_card_format`; the browser sandbox reports the same message. The author regenerates the ability as a Card Source module.
- The one-time migration [`050-native-workshop-drafts.ts`](../server/database/050-native-workshop-drafts.ts) converted stored drafts with the normalization pull-request generation used for that format ([`legacy-card-source.ts`](../server/workshop-pr/legacy-card-source.ts)). A draft it could not convert keeps its source text without validation evidence and needs a new Generation Attempt.

## 6. History

| Date | Change |
|---|---|
| 2026-11-20 | Replaced the retired sandbox contract with this reference for browser-only Card Source modules (ADR 0052, #1887). The server custom-code executor, isolated-vm and the capability contract were removed. The earlier contract is in Git history. |
| 2026-10-10 | Made the retired capability contract fail-closed (ADR 0025). |
| 2026-04-19 | Extracted this file from the old inline section 16 of the design document. |
