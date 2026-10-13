# Each room is an independent animal holder

- Status: Accepted
- Date: 2026-10-13
- Issue: https://github.com/titanxxh/open-agricola/issues/1133

Each real room has an independent Room Animal Holder. The holder retains its room identity and animal assignment. A086 Animal Tamer grants one animal in each room. Ordinary house-pet rules still limit the entire house to one animal. Room capacity and permission to occupy several rooms are separate constraints.

The maintainer chose room holders over a single house-wide species-count pool. A pool can describe two animals in a two-room house, but cannot retain their room assignments or reject two animals assigned to the same room. Storing extra house animals on A086 would give them a card identity instead of a room identity.

The design reuses animal-zone assignment, capacity validation, accommodation search, payment, and persistence. Each holder refers to a real room. Building adds a holder, and renovation preserves existing room identities. House totals are derived from room assignments. Separate card-provided animal zones retain their own identities and permissions.

The room-position `houseAnimals` assignment map replaces the writable house aggregate. Room zone IDs derive from real room positions, and house totals are queries over that map.

The implementation generalizes the existing multi-zone occupancy limit to a zone group. Real room holders share the owner's house group. Its ordinary occupied-holder limit is one; A086 permits one occupied holder per real room. Local capacity remains one. Prefill, accommodation search, and final assignment validation use the same constraint. Separate card holders retain their existing groups.

The UI submits assignments for server-provided `house:<positionKey>` IDs. Serialized `roomAnimalZones` are read-only projections and are removed when loading a snapshot. No compatibility migration for the old aggregate is included.
