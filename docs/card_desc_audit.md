# Card Description Audit vs BGA

Compared `desc` field in `shared/cards/**/*.ts` against `$this->desc` in `/data00/home/xuxinhao.titan/raw/bga-agricola/modules/php/Cards/`.

## Totals

| Deck | Checked | Mismatches | Missing from our codebase |
|---|---|---|---|
| A | 179 | 24 | 1 (A113_HeresyTeacher — BGA desc is empty anyway) |
| B | 180 | 23 | 0 |
| C | 181 | 42 | 1 (C54_MarketStall — we have C54_MarketBooth only) |
| D | 177 | 40 | 2 (D11_LawnFertilzer, D75_WoodField) |
| E | 166 | 25 | 3 (E132_Shearer, E68_CherryOrchard, E80_RockGarden) |
| Major | 10 | 10 | 0 (all differ — convention mismatch) |
| **Total** | **893** | **164** | **7** |

## Common patterns

1. **Icon tokens missing** — plain words (`food`, `sheep`, `cattle`, `vegetables`, `score`, `stone`, `clay`, `wood`, `reed`, `grain`) where BGA uses `<FOOD>`, `<SHEEP>`, etc. Widespread in C, D, E, all Majors.
2. **`<BOAR>` vs `<PIG>`** — ours uses `<BOAR>` in A60, B83, B137, D39, D56, D82; BGA uses `<PIG>` everywhere.
3. **Arrow glyph** — ours uses Unicode `→`; BGA uses `<ARROW>`, `<ARROW-1X>`, `<ARROW-2X>` (the `-NX` variants encode "max N" semantics). A60, C103, D59, D60, E63, E64, E106, E132, all Majors.
4. **Missing `__…__` italics** around action-space names (A150, D129, E3, E30, E38, E63, E64, most Majors).
5. **Missing "(including you)"** on all-player listeners (C137, C141, C145, C163, D77, E49).
6. **Missing "from the general supply"** (A59, A154, A159, C163, C167, E56, E160-ish).
7. **Missing immediate-wood sidekick clauses** on "category-leader" cards (D135, D136, E135, E136).
8. **Ours-only extraneous "Worth N bonus <SCORE>." sentences** on C38, C40, C44, C50, C65, C83.

## Rules-relevant (real behavior) divergences

These are places where our desc describes a **different effect** than BGA — worth investigating whether our implementation is actually wrong, or only the desc.

| Card | Issue |
|---|---|
| A25 Bassinet | Entirely different rule (family-growth food bonus vs shared-action-space placement) |
| A48 ShavingHorse | Missing 5+ optional / 7+ mandatory threshold clause |
| A101 CookeryOutfitter | Ours lists specific cards; BGA excludes Ovens |
| A134 FullFarmer | Missing on-play `1 <WOOD>` + `1 <CLAY>` bonus |
| A142 Cordmaker | Ours: free vegetable; BGA: buy 1 veg for 2 food |
| A153 PigOwner | Trigger timing differs ("5 or more" vs "first time you have 5 after play") |
| A166 | Missing "minimum cost is 0" clarification |
| B26 AgrarianFences | Completely different text |
| B27 Toolbox | Completely different effect described |
| B30 WoodPalisades | Completely different effect described |
| B38 FutureBuildingSite | Completely different card (intentional divergence, marked in code) |
| B39 Loom | Missing harvest-food clause (1/4/7 sheep → 1/2/3 food) |
| B132 EstateMaster | Completely different effect (intentional simplification) |
| B143 ClayWarden | Missing 3/4-player bonus (+1 clay or food) |
| B153 Housemaster | Missing "smallest value counts double" rule |
| B159 LieutenantGeneral | Missing "In round 14, get 1 grain instead" |
| C35 Diplomat | Missing "cannot discard cards unplayed" rule |
| C39 Mask | Entirely different wording/structure |
| C46 SchnappsDistiller | Missing "At the start of these rounds, you get the <FOOD>" |
| C48 SimpleFireplace | Entirely different effect wording |
| C59 Distillery | Missing schnapps-exchange sentence |
| C69 PumpkinField | Entirely different mechanism |
| C129 WetNurse | Missing "(from round 12-13)" restriction |
| C137 Baker | Different trigger scope (BAKE-improvement vs "bake capability") |
| C146 ScrollKeeper | Ours adds "(max 6)" cap not in BGA |
| D14 SeedTrader | Completely different mechanic text + numeric cost diff |
| D29 MuckRake | Simplified; drops "exactly 1 per animal type, different stables" rule |
| D30 ArtisanDistrict | Missing "from bottom row of supply board" qualifier |
| D31 Storeroom | Numeric mismatch ("1 per pair" vs "½ per pair rounded up") |
| D33 SummerHouse | Missing "(still lose points for unused spaces)" clarification |
| D34 LuxuriousHostel | Missing "only one card for stone-house bonus" rule |
| D35 FodderChamber | Vague vs exact player-count thresholds |
| D38 MilkingStool | Missing harvest-food clause (1/3/5 cattle → 1/2/3 food) |
| D60 LargePottery | Missing entire `[Anytime] <CLAY> → 2<FOOD>` exchange |
| D82 HuntingTrophy | **Suspect wrong card** — ours describes Boar→Food; BGA describes renovation/fence discount |
| D150 GodlySpouse | Ours "may" (optional); BGA mandatory |
| D154 ChimneySweep | Missing "Renovating to stone costs 2 stone less" first sentence |
| D161 CabbageBuyer | Simplified; 2 fixed vs 3/2/1 by improvement type (marked in code) |
| E3 TeaTime | Missing `__Grain Utilization__` markdown |
| E63/E64 IronOven/SimpleOven | Missing "When you play, take a Bake Bread action" sentence |
| E101 Blighter | "full stages still left" vs "complete stages left" |
| E105 Pioneer | Different structure/trigger |
| E132 VeggieLover | Completely different formatting |
| E144 WaresSalesman | Different scope ("cooking improvement" vs "cards that turn resources to food") |
| E154 Margrave | Missing "2 food each time any player renovates" clause |
| E156 ClaypitOwner | Missing "or builds" trigger |

## Minor / purely cosmetic

- Typos: **D85 Reader**, **D158 BeanCounter** ("this cards" → "this card") — BGA is correct.
- Trailing periods: A138, B149, D146, D64 (either side has an extra period).
- Curly vs straight quotes, whitespace, `/` vs separated phrases — ignored in this audit per normalization rules.
- Clause-order flips without meaning change: A32, A38, A98, A99, C100, E34, E35, E37 etc.
- `meeple` vs `(meeple)`: A174, A177, B173.

## Majors — structural issue

All 10 majors use a different `description` schema: ours uses prose with `→` + explicit `(max N)`; BGA uses `<ARROW-1X>`/`<ARROW-2X>` icon tokens that encode the "max N" semantics. A systematic rewrite would fix all 10 at once.

## Missing from our codebase

| Card | Deck | BGA note |
|---|---|---|
| A113_HeresyTeacher | A | BGA desc is empty — safe to skip |
| C54_MarketStall | C | We have C54_MarketBooth; BGA has both (shared slot) |
| D11_LawnFertilzer | D | Unimplemented |
| D75_WoodField | D | Unimplemented |
| E68_CherryOrchard | E | Unimplemented |
| E80_RockGarden | E | Unimplemented |
| E132_Shearer | E | Unimplemented |
