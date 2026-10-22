# 26. Each room is an independent animal holder

- Status: Accepted
- Date: 2026-10-13

## Context

Issue [#1133](https://github.com/titanxxh/open-agricola/issues/1133). A086 Animal Tamer allows one animal in each room, while ordinary house-pet rules limit the house to one animal. A house-wide species-count pool could count two animals in a two-room house but could not keep their room assignments or reject two animals in one room.

## Decision

- Each real room has a capacity-one Room Animal Holder identity `house:<positionKey>`. Ordinary house-pet rules expose only the bottom room in the leftmost room column as a legal holder. A card that permits several occupied rooms exposes their separate holders; renovation preserves room identities.
- `PlayerState.houseAnimals`, a room-position assignment map, is the only writable room assignment; house totals are queries over it. Serialized `roomAnimalZones` are read-only projections removed on load.
- Room capacity and permission to occupy several rooms are separate constraints. Room holders share the owner's house occupancy group, whose ordinary occupied-holder limit is one; a card may raise that limit without changing per-room capacity.
- The existing multi-zone occupancy limit is generalized to zone groups and shared by prefill, accommodation search and final validation. Separate card-provided zones keep their own groups and identities.
- The UI submits assignments for server-provided holder IDs.
- Per the maintainer decision of 2026-10-22, the ordinary pet's leftmost-bottom room is its actual assignment, not just a display position. Recovery and room construction move an existing ordinary pet to that room automatically. This preserves animal totals and does not count as acquiring or newly placing an animal.

## Consequences

- Animal assignment, capacity validation, accommodation, payment and persistence are reused unchanged.
- No compatibility migration for the old aggregate is provided.

## Alternatives considered

- A house-wide species-count pool: cannot keep room assignments.
- Storing extra house animals on the card: gives them a card identity instead of a room identity.
