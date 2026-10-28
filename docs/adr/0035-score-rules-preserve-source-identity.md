# 35. Score rules preserve source identity

- Status: Accepted
- Date: 2026-10-29
- Implementation: Pending

The maintainer chose option A: retain the current scoring result and add the semantic distinctions required by rule consumers. A separate internal scoring model and display projection was considered, but the observed defects do not yet justify migrating every scoring input contract.

The current result can express the correct total while losing its meaning. A public marker becomes an ordinary card bonus, and a reduction in a positive base category becomes a separate negative card score. Other cards then mistake those representation choices for genuine negative points.

Keep `computeScores()` and its `PlayerScoreSummary[]` result. Preserve an independent marker identity in score entries. Ordinary negative-score queries exclude such markers while totals still include them. Genuine negative card contributions remain observable even when positive contributions make their display category total nonnegative.

Cards provide base-category adjustments through deterministic rule contributions. Apply those adjustments before exposing the effective category score to other rules. An explanatory arithmetic difference is not a separate card penalty. Card implementations use shared score-rule queries instead of independently interpreting display aggregates or maintaining card-ID exclusion lists.

Resource conversion is a different concern. A chosen pre-scoring payment commits through the existing payment flow before scoring reads the remaining inventory. A scoring query stays pure. Abilities restricted to pre-scoring require an explicit restriction at the shared anytime admission and execution boundaries; permission to also act during pre-scoring does not imply that restriction.

This keeps the public scoring shape and existing consumers close to their current form. The trade-off is that rules and display still share a result structure, so source-aware types, shared queries, boundary checks and cross-card tests must preserve these distinctions. A future model split must preserve the same semantics.
