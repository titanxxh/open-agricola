# Loose stables retain animal species and count

- Status: Accepted
- Date: 2026-10-17
- Issue: #1267

Loose-stable storage currently retains only a species per farm position. E012 Animal Bedding and C089 Stable Master can increase one stable's capacity above one, but a confirmed assignment of two or three animals loses its count when written back. Resource totals still use submitted counts, so E012 can leave three sheep in inventory while its actual zones contain two animals and require another reorganization.

The maintainer chose one count-bearing assignment per physical loose stable over parallel species and count maps. `stableAnimals` records `{ animalType, animalCount }` at the stable's position key. A nonempty entry has one enabled species and a positive integer count. Empty assignments are omitted; `stableTiles` continues to own the stable's physical existence. Capacity belongs to the current rule query and is not stored as the assignment quantity. Preserve physical holder identity rather than putting ordinary stable animals in E012's card state or inferring allocation from total resources.

Reorganization, zone queries, payment, capacity enforcement, prefill, scoring, serialization and recovery consume the same assignment. Animal-number rules sum `animalCount`; presence, occupied-space and distinct-species rules retain their respective meanings. Removing some animals from a stable decrements its count and removes the entry only at zero. Reducing capacity preserves resource totals until the player explicitly places or discards displaced animals under the existing reorganization contract. No old species-string save migration is required.

The frontend renders the backend's actual stable count and capacity and submits assignments to the existing authoritative reorganization command. Local presentation does not adjudicate E012 or C089 rules. A legal assignment must survive write/read, return/live response, turn handoff and recovery with inventory and assigned counts consistent. Completing an unrelated continuation cannot repair a lost count or certify a valid assignment.

Session acceptance covers E012's two-animal stable and ordinary one-animal control, C089's three-animal first stable and ordinary subsequent stable, atomic over-capacity rejection, one normal confirmation, partial payment, capacity reduction, undo and JSON/private-cursor recovery. C089 was independently reproduced and is covered by the same Session repair. Existing room-holder permissions and mixed-species card-holder rules retain their separate contracts under ADR 0026.
