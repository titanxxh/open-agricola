# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root.
- **`docs/adr/`** for ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```text
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

This repo currently uses a single root context. There is no `CONTEXT-MAP.md`.

## Use the glossary's vocabulary

When your output names a domain concept in an issue title, a refactor proposal, a hypothesis, or a test name, use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use, or there's a real gap to note for `/grill-with-docs`.

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) -- but worth reopening because..._

## Reviewing rule tests

When implementing or reviewing Session assertions or audit migration, read `docs/CARD_TEST_TEMPLATE.md` §5.2 and §9.1. Review the actual inputs inside callbacks and loops, the card owner, acting player and bystanders, and independent expected values including ordinary action gains. A passed destination title proves execution, not complete rule assertions. Mechanical seat/field and assertions-only preservation checks enforce their declared contracts; the reviewer decides whether the chosen inputs and fields express the rule.
