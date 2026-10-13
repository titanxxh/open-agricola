# Composite actions use the existing replacement selection

- Status: Accepted
- Date: 2026-10-13
- Issue: https://github.com/titanxxh/open-agricola/issues/1124

Composite actions pass through the existing `computeReplace` selection before their chosen flow expands. The original action remains an explicit choice and retains its flow. This aligns execution with the existing replacement-aware availability query.

B026 formerly replaced Sow and Bake Bread separately and added the original action inside each replacement. The resulting flow permitted a third action and two fence actions. Two additional `isDoable` listeners duplicated availability already derived from the replacement flow.

The maintainer chose composite replacement over a card-owned allowance counter. B026 expresses mutually exclusive plans for Sow with Bake Bread, Fencing with Sow, and Fencing with Bake Bread. Each plan permits either action alone or both in either order. The flow limits each use to two actions and one fence action.

Both direct action entry and card-granted action expansion use the same replacement boundary. A deferred `expandFlow` ActionNode preserves the original composite through replacement selection, cloning and private cursor restoration. Expansion preserves source attribution, producer guards and mandatory continuation semantics. It clears the host's `checkedReplaceAction` marker so child actions make their own replacement decisions. It does not introduce an additional composite-host before/after lifecycle.

The Session matrix covers all plans and action orders, single actions, fence-only admission, illegal fence submission, undo, cursor restoration, card-granted use and child-action replacement. No compatibility migration is required.
