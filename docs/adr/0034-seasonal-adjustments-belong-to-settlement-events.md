# 34. Seasonal adjustments belong to settlement events

- Status: Accepted
- Date: 2026-10-24

Through the Seasons changes costs, accumulation, grants and heating requirements, but final totals alone cannot explain its contribution. Some existing logs omit the contribution even when events retain its source. Seasonal adjustments describe the actual contribution to a committed settlement, including an affected settlement whose final total is zero.

Attach typed season identity and actual adjustment quantities to the owning public settlement facts. Derive one operation log containing both the result and its seasonal explanation. Preserve the existing meaning of resource-transfer and construction quantities, and keep season provenance separate from card-stat Cost Attribution. Selected payment candidates retain only their own adjustment path. Undo, recovery and Replay preserve the recorded facts; presentation never recomputes historical rules.

Record a zero-result settlement when the season actually changed its outcome; omit a seasonal explanation when it had no effect. This trades slightly larger fact payloads for an auditable explanation without duplicate resource movements or a second log stream. A generic text-only seasonal event would leave presentation responsible for joining operations or reconstructing amounts, while treating seasons as cards would pollute card statistics.

Non-harvest breeding results are mapped from the existing birth facts for both season and card sources. A trigger log or a later animal-allocation total does not substitute for the recorded newborn quantity; ordinary harvest summaries retain their existing aggregation.

This change records new settlements. It does not infer missing provenance in existing history.
