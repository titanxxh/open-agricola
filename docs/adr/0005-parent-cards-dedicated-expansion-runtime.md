# Parent Cards use a dedicated expansion runtime

- Status: Accepted
- Date: 2026-06-18

Parent Cards will use a dedicated expansion runtime instead of ordinary A-E Card Source content. The runtime owns the full expansion lifecycle: private mother/father candidates before play, public kept side cards, mother round rewards, father side quests, and mother fractional scoring. The first implemented slice is the enable option plus simultaneous mother/father selection phase; later slices add mother rewards, father quests, ordinary-card draw rewards, and scoring without moving Parent Cards into ordinary hand-card or purchase flows.

The rejected alternative was to model Parent Cards as normal occupations/minor improvements or as hidden ordinary cards. That would reuse some card UI, but it would blur card-source boundaries, leak private setup candidates unless the ordinary hand model was bent, and force father/mother lifecycle rules into card implementation paths that are not card purchases or played-card effects.
