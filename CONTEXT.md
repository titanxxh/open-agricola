# Open Agricola

Open Agricola is an online implementation of Agricola rules with authoritative server-side game state and card behavior.

## Language

**Harvest**:
A full harvest sequence that may include field, feeding, breeding, and harvest-scoped card effects.
_Avoid_: Private field phase

**Harvest Field Phase**:
The field phase that belongs to a full harvest.
_Avoid_: Private field phase

**Private Field Phase**:
A card-granted field phase on one player's farmyard only that is not a harvest.
_Avoid_: Harvest, harvest field phase

**Reap**:
The act of moving harvestable crops from fields to a player's supply.
_Avoid_: Harvest

**Card Field**:
A played card that can hold planted crops and is considered a field for rules that count or reap fields.
_Avoid_: Harvest hook

## Relationships

- A **Harvest** includes at most one **Harvest Field Phase**.
- A **Harvest Field Phase** performs **Reap** for each applicable player.
- A **Private Field Phase** performs **Reap** for one player, including that player's **Card Fields**, without entering **Harvest**.
- A **Harvest Field Phase** may trigger harvest-scoped card effects; a **Private Field Phase** must not.
- A **Card Field** may have effects that happen when crops are **Reaped** from that card; those effects are not harvest-scoped unless the card says so.

## Example dialogue

> **Dev:** "Does Festival Planning trigger cards that say 'in the field phase of each harvest'?"
> **Domain expert:** "No. Festival Planning grants a Private Field Phase, so it reaps crops but is not a Harvest Field Phase."

## Flagged ambiguities

- "field phase" can mean **Harvest Field Phase** or **Private Field Phase**; resolved: card text that says "this is not a harvest" uses **Private Field Phase**.
