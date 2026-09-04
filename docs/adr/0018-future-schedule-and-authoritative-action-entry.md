# Future schedules preserve targets and card action spaces use strict entry

- Status: Accepted
- Date: 2026-09-04

Future Schedule requests distinguish Exact Future Targets from Future Prefixes. Exact targets retain their declared round and are discarded outside `current round < target <= 14`; prefixes retain only their still-existing contiguous portion. The shared resolver never moves an out-of-range target to round 14. A card that genuinely needs a different mapping must state it at the call site. This keeps scheduled identity visible and prevents unrelated late rewards from collapsing onto the final round.

Card-created Action Spaces use Strict Action Entry by default: their own executable predicate is enforced by both availability projection and the authoritative `takeAction` boundary. Standard composite Action Spaces remain opt-in because OR flows may intentionally enter with currently unavailable children and expose a legal skip or replacement. Cards that grant a rule action invoke that action directly; granting `family-growth` does not expand the entire Wish for Children Action Space and therefore does not inherit its minor-improvement branch.

The rejected alternatives were global round clamping, making every Action Space strict, and expanding a named Action Space whenever a card grants one of its actions. They respectively invent rewards on the wrong round, over-block composite actions, and attach unrelated Action Space benefits to card-granted actions.
