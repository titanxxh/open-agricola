# 27. Composite actions use the existing replacement selection

- Status: Accepted
- Date: 2026-10-13

## Context

Issue [#1124](https://github.com/titanxxh/open-agricola/issues/1124). B026 Agrarian Fences replaced Sow and Bake Bread separately and re-added the original action inside each replacement, which allowed a third action and two fence actions. Two extra `isDoable` listeners duplicated availability the replacement flow already implied.

## Decision

- Composite actions pass through the existing `computeReplace` selection before their chosen flow expands. The original action stays an explicit choice and keeps its flow, matching the replacement-aware availability query.
- Direct entry and card-granted expansion share this boundary. A deferred `expandFlow` ActionNode keeps the original composite through replacement selection, cloning and private-cursor restoration, including its node ID and label style.
- Expansion preserves source attribution, producer guards and mandatory continuation semantics, clears the host's `checkedReplaceAction` so children make their own replacement decisions, and yields to the Session driver to pick the next child's owner. There is no extra composite-host before / after lifecycle.
- Description queries expand a detached copy and never change the live tree.
- A card that limits combinations expresses mutually exclusive plans as replacement alternatives, not an allowance counter.

## Consequences

- One replacement mechanism covers single and composite actions; the card keeps its plans in its own file.
- No compatibility migration is needed.

## Alternatives considered

- A card-owned allowance counter: duplicates what the plan structure already expresses and needs its own availability checks.
