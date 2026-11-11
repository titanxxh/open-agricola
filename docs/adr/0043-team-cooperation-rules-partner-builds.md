# 43. Team cooperation rules follow the German appendix, with one Target Farm per build and partner builds visible to cards

- Status: Accepted
- Date: 2026-11-10

## Current applicability (2026-11-12)

Under [PRD #1655](https://github.com/titanxxh/open-agricola/issues/1655) and [#1661](https://github.com/titanxxh/open-agricola/issues/1661), main removes this Beta business, including Team, Multihand, Marketplace, target-farm selection and partner construction prices. The accepted rules below remain the historical basis for the forward prerelease reconstruction in #1666. They do not describe current main runtime support. No old-Beta migration, drain or compensation is added. Ordinary construction facts, owner-target card flows and the complete unit-price policy in ADR 0044 remain formal functionality.

## Forward reconstruction provenance

The fixed Beta business source is `53b8a0ccf5649ce3bb7084303f0677e46c1d20e7`. Main cleanup started at integration `642c6c2ae2099a98bc07dd2568c1ffdaf35ad4d6`. After the independent operations test correction, the cleanup and formal-consumer fixes occupy `b9387d4e1a16721e197a21be73607f206f06bfa3..72af5db6227966a5755f7bce67ced881d1b6e182`.

The exact file and hunk inventory remains reproducible from Git:

```bash
git diff --no-renames --unified=0 b9387d4e1a16721e197a21be73607f206f06bfa3 72af5db6227966a5755f7bce67ced881d1b6e182
git show 53b8a0ccf5649ce3bb7084303f0677e46c1d20e7:<path>
```

Prerelease reconstruction ports only Team seating/scoring, Marketplace, target-farm selection and partner-build contracts, effects and tests forward onto cleaned main. It does not reverse this range or replace mixed files with their source53 versions. In particular, source authority/lifecycle migrations 037/039, public-card registry 038, current Beta qualification, entry/handoff pages, the authenticated same-origin entry read fix, language pin, release-channel governance and owner operations remain inherited main infrastructure. Old main feature stages and invitation exceptions do not replace prerelease environment admission.

Retained ordinary consumers include [complete unit prices](0044-unit-prices-precede-cost-transformations.md), [D015](../../shared/cards/D/D015_ClaySupports.ts) and [M036](../../shared/cards/M/M036_PeatMoss.ts), [two-player card builds](../../server/__tests__/own-farm-card-session.test.ts), [old ordinary construction cursors](../../server/__tests__/fixed-room-prices-recovery.test.ts), [owner-target reactions](../../server/__tests__/before-placement-owner-target-session.test.ts), and [custom-code owner/payment recovery](../../server/__tests__/custom-code-executor.test.ts). Generic target-player routing, hooks, payment/supply, construction facts, controlled seats, Hotseat, spectators and capability transport remain current main behavior. Each future Beta hunk must preserve those consumers and their tests.

## Context

Issue #1597 adds the official partner game rules on top of the team seating and scoring from #1596. The English appendix and the German appendix ("Das Partnerspiel", revised edition and 15th anniversary appendix, page 9) differ. The German text makes the giver pay the Marketplace tax, lets a player who builds rooms, stables or fences build additionally on the partner's farm, and states that "Baukostenmodifikationen auf seinen ausgespielten Karten greifen dabei auch für den Partner". No card in the pool builds or plows on another player's farm, and no community or reference implementation rules on how cards react to such builds.

## Decision

- The German appendix is the rule authority. Team Cooperation Rules are one switch in the Team Configuration, off by default, available to Team and Multihand games, and independent of the team scoring method.
- Two deliberate deviations: a single build happens on one farm only, so one action cannot build on the actor's farm and a partner's farm together; plowing onto a partner's farm is not supported.
- Every build chooses one Target Farm before its first step: builds from action spaces, card-granted Build Rooms, Build Stables and Build Fences actions, and card effects that build directly. A card build whose text names "your house" or "your farm", uses components stored on the card or set aside by its owner, or leaves a lasting layout exception on the farm declares itself own-farm only. The core path keeps no list of such cards.
- A Partner Build has three roles: the builder (the actor), the farm owner and the built objects with their material, count, position and pasture size. Build facts record these roles truthfully, and hooks still dispatch on the builder.
- Card reactions read the build literally. "You build" matches the builder and "another player builds" matches the builder. Conditions on the built object read the object. A possessive object condition, such as "your house" or "your 2nd stable", requires the object to belong to the card owner, so it holds for neither the builder nor the farm owner. Effects and use limits belong to the card owner.
- Building Cost modifiers of the builder apply to Partner Builds, per the German text. Their references to the farm and the built objects read the Target Farm; "if you live in" conditions read the builder. This is the only place where a possessive is not read literally.
- Ordinary partner room construction increases each base price, including card-provided unit prices, by one corresponding building resource and one reed before genuine discounts, substitutions and resource removal. This increase is ordinary building cost, not a protected fee. Source-granted exact or free construction retains its existing pricing policy; ordinary partner stables cost 3 wood unless their applicable source or substitution sets another price. The fence surcharge of 1 wood per 1-3 fence pieces is always added and is never reduced. The builder pays, the farm owner's pieces are used, placement follows the Target Farm and the farm owner rearranges their animals. The room-price decision was amended under [#1636](https://github.com/titanxxh/open-agricola/issues/1636) and [ADR 0044](0044-unit-prices-precede-cost-transformations.md).

## Consequences

- Build events and cards that use the actor's house type as the material of the room being built must read the built objects instead. Before the beta, a card audit slice reviews the build reaction cards and the card-granted builds against these categories, with at least one Session test per category.
- Delivery order: Marketplace, Target Farm with stables, rooms, fences, card audit, then the Experimental Feature moves from `off` to `beta`.

## Alternatives considered

- Building on both farms in one action, as the German text allows: rejected for a single payment and placement context per build.
- Making Partner Builds invisible to card reactions: simpler, but it hides real builds from the rules engine and contradicts the literal subject of the German text.
- Keeping card-effect builds on the card owner's farm: rejected because a card-granted build is a build like any other; only the card's own text binds it to its owner's farm.
- Earlier interpretation that a complete card price waived the partner room increase: superseded by the maintainer decision in #1636. Cooperation raises the base room price; ordinary cost transformations still apply to that increased base. This does not make the room increase a protected surcharge or change source-granted exact/free construction.
