# 5. Parent Cards use a dedicated expansion runtime

- Status: Accepted
- Date: 2026-06-18

## Context

Parent Cards bring private mother and father candidates before play, public kept side cards, mother round rewards, father side quests and mother fractional scoring. None of these is a card purchase or a played-card effect.

## Decision

- Parent Cards use a dedicated expansion runtime in `shared/parents/*`, not ordinary A–E Card Sources. The runtime owns the full lifecycle: enable option, simultaneous mother / father selection, rewards, side quests, ordinary-card draw rewards and scoring.
- Parent data and runtime asset references are separate from Card Definition / Card Impl projections; portraits and backs come from external assets pinned by `public-assets.ref`.
- Candidates and draw decks use non-public seeds, and every rule is backend-authoritative.

## Consequences

- Private setup candidates never pass through the ordinary hand model.
- Parent rules never enter card purchase or played-card implementation paths.

## Alternatives considered

- Modelling Parent Cards as occupations, minor improvements or hidden ordinary cards: reuses some UI but blurs Card Source boundaries, leaks private candidates unless the hand model is bent, and forces parent lifecycle rules into card purchase paths.
