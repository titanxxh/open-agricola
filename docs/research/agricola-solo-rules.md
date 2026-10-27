# Agricola solo rules and BGA implementation

Research date: 2026-10-26. This reference distinguishes published rules, edition changes, and BGA source behavior. “Moor” means Farmers of the Moor, “Seasons” means Through the Seasons, and “Parents” means the Parent Cards mini expansion from Consul Dirigens.

## Comparison

Standard solo is a 14-round score challenge without an opposing farmer. Expansions add rules to that game. A campaign links several games, while an automa adds a simulated opponent.

| Ruleset | Solo-specific changes | Published target | BGA source inspected |
|---|---|---|---|
| Revised base game | No starting food, adult feeding increased, Forest replenishment reduced, traveling cards removed after use | Score challenge, with campaign targets below | Implemented |
| Revised Farmers of the Moor | Different special-action deck procedure, no Side Job tile, no Meeting Place cover card | 65 without hand cards, 70 with hand cards | Unsupported |
| Through the Seasons | No separate solo amendment in the rules examined | No separate solo target found | Unsupported |
| Parent Cards | No separate solo amendment in the rules examined | No separate solo target found | Unsupported |
| Solo campaign | Permanent occupations and starting food based on the previous score surplus | 50, 55, 59, 62, 64, 65, 66, 67 | Implemented |
| Karl Stemmer's Moor automa | Two-player setup with a neutral opponent | Highest personal score | Unsupported |

The expansion findings come from the publisher's [Moor rules, pages 2–3 and 8](https://www.lookout-spiele.de/upload/en_agricolare_farmers_re.html_Rules_Agricola-RE-Farmers_EN.pdf#page=8), [Seasons rules, pages 10–11](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=10), and [Parents rules, pages 2–4](https://www.lookout-spiele.de/upload/en_agricolare_consuldirigens.html_Agricola_CD_Regeln_EN_V7.pdf#page=2). BGA evidence is detailed below.

## Revised base game

Solo uses the two-player action spaces. The player starts with no food and places their people one after another. Each adult needs 3 food per harvest, while a newborn still needs 1. The Forest accumulation space receives 2 wood each round. A traveling minor improvement leaves the game after use.

The rules permit choosing the starting hand and the order of round cards within each stage, instead of randomizing them. Stages and harvest timing remain unchanged. These options change the information available for planning. They do not introduce an opponent. See the [base rulebook, page 12](https://lookout-spiele.de/upload/en_agricolare.html_Rules_Agricola-RE_EN.pdf#page=12).

## Farmers of the Moor

The revised expansion keeps the base solo food and wood changes. Setup still gives 5 forests and 3 moors. Solo omits both the Side Job tile and the cover card for Meeting Place and Grain Seeds.

Solo shuffles 10 special-action cards into a draw pile. One card is available at a time. Using one printed action normally discards that card. Once per round, paying 2 food prevents that discard, allowing a second use. An unused card can remain for the next round or move to the bottom before a replacement is revealed. After the draw pile empties, the last used card remains available for the rest of the game. A special action still requires an unplaced person.

Heating remains additional to feeding. Each room costs 1 fuel, with a total reduction of 1 for a clay house or 2 for stone. The solo targets are 65 points at level I without hand cards, and 70 at levels II and III with cards. See the [revised rules, pages 2–4, 6, and 8](https://www.lookout-spiele.de/upload/en_agricolare_farmers_re.html_Rules_Agricola-RE-Farmers_EN.pdf#page=8).

The 2009 edition needs a separate label. It also starts solo with no food and uses adult feeding of 3, but its targets are 65, 70, and 72 for levels I, II, and III. Its family-game levels I and II do not accumulate food on Starting Player in solo. See the [original rules, page 6](https://www.lookout-spiele.de/upload/en_agricola_farmers.html_Rules_AgricolaFarmers_EN.pdf#page=6).

## Through the Seasons

The published Seasons rules contain no separate solo setup, feeding rule, or target. Seasonal effects apply to the normal solo game. The anniversary rules explicitly allow combinations with other expansions, including Farmers of the Moor.

The 2008 postcard and anniversary revision differ:

| Feature | 2008 postcard | Anniversary revision |
|---|---|---|
| Summer action | Holiday points based on people already placed that round | Plow 1 field, take a baking or grain-sale action, or do both. The sale exchanges 1 grain for 4 food. |
| Winter family growth without room | 2 wood and 3 food | 2 wood and food equal to remaining harvests |
| Summer with Moor | No heating exemption stated | No heating at a harvest ending a Summer round |

Both versions also change resource replenishment and other actions by season. For example, Spring reduces wood replenishment and improves fencing, while Autumn increases wood and reed replenishment and discounts major improvements. The current season therefore changes a solo player's available actions and costs.

Sources: [original rules, pages 1–2, preserved PDF](https://www.boardgamesbot.com/assets/games-library/agricola-through-the-seasons/manual_eng.pdf) and [publisher's anniversary appendix, pages 10–11](https://www.lookout-spiele.de/upload/de_15jahreagricolajubilaeumsbox.html_Argicola_Aniversery_Appendix_155_EN_WEB.pdf#page=10).

## Parent Cards

Parents can be added to any Agricola game. The rulebook gives no solo exception. Each player receives two mother and two father cards, then keeps one of each after choosing their hand cards.

A mother provides a scheduled benefit and a fractional score adjustment. A father provides a task with three reward tiers. Claiming a reward turns the father face down, so the task pays only once. A player may wait for a higher tier.

These benefits make the game easier. They do not replace the base solo rules or add an opponent. The permission for any game, together with Seasons' combination rule, supports combining all three expansions. No separate target for that combination was found. See the [Parents rules, pages 2–4](https://www.lookout-spiele.de/upload/en_agricolare_consuldirigens.html_Agricola_CD_Regeln_EN_V7.pdf#page=2).

## Official solo campaign

The campaign has eight targets: 50, 55, 59, 62, 64, 65, 66, and 67. After the first successful game, choose one played occupation to make permanent. After later successful games, another played occupation may become permanent. Permanent occupations start in play without an action or occupation cost. Their printed individual costs still apply. Permanent and hand occupations total seven at setup.

The next game's starting food equals the previous surplus above target divided by two, rounded down. Nonpermanent cards return to their decks. A failed game may be retried with no starting food. After game eight, the same permanent occupations can continue, with the target increasing by one each game. See the [base appendix, page 10](https://lookout-spiele.de/upload/en_agricolare.html_Appendix_Agricola-RE_EN.pdf#page=10).

## BGA implementation evidence

The inspected local BGA checkout was `/home/xxh/bga-agricola`, fetched to `origin/main` at `8f902cacf0ca0a7f7aa5e40d02f0aa50dbe10e59`, dated 2026-10-24. The [live BGA game panel](https://en.boardgamearena.com/gamepanel?game=agricola) exposed release `261026-0018`. No evidence maps that release to this commit. The following describes source inspection, without a complete online playthrough.

The standard solo changes use these entry points, all under `modules/php/`:

| Behavior | Source location |
|---|---|
| Solo mode predicate | `Core/Globals.php:224–226` |
| Starting setup | `Managers/Meeples.php:84–100` |
| Forest replenishment | `Cards/Actions/ActionForestSolo.php:12–18` |
| Feeding demand | `Models/Player.php:1005–1011` |
| Traveling card removal | `Models/PlayerCard.php:637–640` |
| Campaign targets and continuation | `Managers/Campaign.php:19`, `342–349` |

`gameoptions.inc.php` includes solo campaign, ten-card selection keeping seven, free selection from all cards for solo, seed replay, and Living Hand options. Seed replay allows repeatable setups. Free selection and a larger initial choice provide more control over the starting engine than a random hand.

Beginner mode removes hand cards (`gameoptions.inc.php:38–45`). The free-selection mode also offers a one-time choice between random action-card reveals and choosing each reveal from the current stage (`States/TurnTrait.php:44–55`, `86–88`, `114–144`). Ordinary solo does not offer that choice.

The four alternatives under Draft mode, ten-card selection, free selection, seed replay, and Living Hand, are mutually exclusive. Campaign requires Draft mode Disabled and a non-Beginner competitive level (`gameoptions.inc.php:269–283`). It therefore cannot combine with any of those four alternatives. Campaign adds no separate card-set restriction and continues to use the selected pool, player-count filter, and banlists (`Managers/PlayerCards.php:143–159`). Additional Action Spaces and Snake Opening both require at least two players (`gameoptions.inc.php:74–80`, `247–249`).

BGA's Living Hand deals four occupations and four minor improvements in solo. At the start and end of the player's turn, each card type below four is replenished through random two-card choices until that type reaches four. This mode requires All Cards. The relevant source is `Managers/PlayerCards.php:75–79`, `482–542`, and `States/DraftTrait.php:795–925`.

That implementation differs from the publisher's Living Hand variants. The appendix describes an initial hand of five cards of each type, or a later version with three of each type, followed by replacement after playing a card. See the [base appendix, page 9](https://lookout-spiele.de/upload/en_agricolare.html_Appendix_Agricola-RE_EN.pdf#page=9).

No Moor, Seasons, or Parents runtime or corresponding game option was found in the inspected BGA source. The Consul Dirigens option selects ordinary C and D cards in `Models/PlayerCard.php:181–185`; it does not add the separate Parents mini expansion. The repository's public GitHub page returned 404 during research, so the evidence here identifies the inspected revision and local source paths.

## Other solo variants

Karl Stemmer's automa, hosted by Lookout, uses a two-player setup and starts the human with 2 food. Dice direct a neutral opponent that blocks spaces, clears resources, removes major improvements, grows its workforce, and interferes with special actions. The neutral player has no score. An optional harder rule increases special-action blocking. See the [publisher-hosted variant, pages 1–2](https://www.lookout-spiele.de/upload/en_agricolare_farmers_re.html_Agricola_Moorbauern_SoloVariante_EN_221202.pdf).

Agricola Special Edition also announced a Team Turczi automa while retaining the original score-challenge mode. This is a separate edition. Its [June 13, 2025 announcement](https://gamefound.com/en/projects/awaken-realms/agricola-special-edition/updates/9) does not establish BGA support.

The publisher's [September 1, 2026 update](https://gamefound.com/en/projects/awaken-realms/agricola-special-edition/updates/30) provides a [24-page main rulebook](https://drive.google.com/file/d/1bUOhq5li12YB1fWpqxRX4XAurqVEy5uL/view) and a [48-page Expansions & Game Variants rulebook](https://drive.google.com/file/d/1rm2cs__c6cGfPaQ6WkpUIJw0P4p6tFLh/view). The update labels them work in progress, close to completion but not the final printed versions. Both PDFs were opened and their page counts checked during this research.

The expansion book contains Parents on page 30, Through the Seasons on page 32, traditional solo and Moor solo on page 36, the new Agricoma opponent on pages 37–43, and the solo campaign on page 47. Agricoma's expansion rules cover Moor and Irrigation on page 42 and Through the Seasons on page 43. The latter specifies that Agricoma ignores seasonal effects and earns 1 point each time the human uses a seasonal action space. No dedicated Parents rule appears in that expansion-support section.

The [October 13, 2026 production update](https://gamefound.com/en/projects/awaken-realms/agricola-special-edition/updates/31) reports completed production and transport activity, rather than universal delivery.

## Evidence limits

Published expansion permissions do not establish balanced scoring comparisons across combinations. No official combined target or campaign adjustment for Moor, Seasons, and Parents together was located. The Special Edition PDFs and Agricoma expansion-support pages were checked for availability and scope; the full opponent rules have not been audited. BGA source findings require live verification before being described as tested behavior of release `261026-0018`. The sections above do not assess Open Agricola's implementation; the supplement below records the six named cards' current behavior separately from rule evidence.


## Six card exceptions investigated for standard solo

This supplement was researched on 2026-10-27 for [单人可发卡的比较、邻座与特殊行动牌例外如何按官方证据裁定？](https://github.com/titanxxh/open-agricola/issues/1404). It examines E014 Wood Saw, E066 Barn Shed, M027 Garden Path, M054 Agricultural Implement, M056 Peat-Cutting Rights, and M057 Taps. Source observations below are separate from Open Agricola's implementation at `941197afd`. This research does not create a solo banlist or a general rule for neighbors or comparisons with no opponents.

The evidence has different authority. A publisher rulebook establishes a general rule. An authenticated original card face establishes printed wording. A forum user's transcription can establish what that user reported, but it does not authenticate a print run. A reply is a publisher or designer ruling only when the respondent's identity and role support that attribution. A community reproduction with an unresolved source chain remains a reproduction.

### Rules that apply before considering individual exceptions

The [revised base appendix, page 4](https://www.lookout-spiele.de/upload/en_agricolare.html_Appendix_Agricola-RE_EN.pdf#page=4) excludes the card owner from "another player." It does not define how every comparison behaves when there are no other players. The [base solo rule, page 12](https://www.lookout-spiele.de/upload/en_agricolare.html_Rules_Agricola-RE_EN.pdf#page=12) removes traveling cards after play. Neither passage establishes that a solo player is their own left-hand neighbor.

The [Moor rules, page 4](https://www.lookout-spiele.de/upload/de_agricolare_moorbauern.html_Rules_Agricola-RE-Farmers_EN.pdf#page=4) require taking a special-action card to include actually performing one of its printed actions. A player cannot take a card without executing an action or choose an action they cannot perform. The same page normally requires a person still in the house. The [solo procedure on page 8](https://www.lookout-spiele.de/upload/de_agricolare_moorbauern.html_Rules_Agricola-RE-Farmers_EN.pdf#page=8) replaces the multiplayer card display with one available face-up card, normally discarded after use, and permits paying 2 food once per round to prevent that discard. Its preparation procedure does not authorize searching the hidden draw pile. These rules provide the default procedure. They do not by themselves settle each special card's exception.

### Findings by evidence level

| Card | Established evidence | Inference or remaining gap |
|---|---|---|
| E014 Wood Saw | An owner-posted photograph authenticates the revised English comparison wording. | Its solo comparison with no opponents remains unresolved. A legacy community no-effect note is not a revised publisher ruling. |
| E066 Barn Shed | The same physical-card photograph shows an explicit solo substitution of the owner for another player. | This exception settles the named card, without defining a general self-neighbor or self-as-other rule. |
| M027 Garden Path | The publisher defines the marker's minus-one scoring treatment. | No checked primary source determines its solo recipient. |
| M054 Agricultural Implement | The general publisher rule connects taking a special-action card with executing one action. | Applying that rule to the card supports an actual action. The revised card face and any card-specific solo exception remain unverified. Pure card-taking is current code, not confirmed rules. |
| M056 Peat-Cutting Rights | The original solo discussion and its personal proposed answer are traceable. | No authenticated ruling settles a scheduled offer when the current solo card lacks Cut Peat. |
| M057 Taps | The revised editor confirms an extra turn under normal special-card rules. | Applying current-face-up-card availability and normal solo use limits is a transparent inference from that answer plus the solo rules. |

### E014 Wood Saw

An [owner's 2023-11-13 post](https://boardgamegeek.com/thread/3189864/article/43279755#43279755) states that bearperson bought the newly released deck at Essen and photographed it in response to requests. The [image page](https://boardgamegeek.com/image/7850922) and [3848 by 2523 original photograph](https://cf.geekdo-images.com/N0Af0mFTdeg48flO3F3-Qg__original/img/4fyx3JQMlNCbZcq2zE6JfaOqPSo=/0x0/filters:format(jpeg)/pic7850922.jpg) provide physical-print evidence, rather than a community rendering. Wood Saw is the second card in the top row. Its condition compares the owner's people with all other players, followed by permission to build rooms without placing a person. No solo sentence or player-count mark is visible on that card. The absence of such a mark does not decide the empty-opponent comparison.

The legacy FR060 Wood Saw has a community note saying it has no solo effect. Its provenance reaches William F, username wsefranc, who posted his [France deck compendium in 2015](https://boardgamegeek.com/thread/1467083/france-deck-compendium) and linked his [original Google document](https://docs.google.com/document/d/1PzINV2eu05I2ypPB_vQVbdth-IDlS-tVRNfTC72jIDI/edit). Page 4 contains that solo note without a source or author-ruling annotation. Other entries on that page do identify author or forum sources. This establishes a legacy community interpretation, not a publisher's revised E014 ruling.

The [Ephipparius publisher page](https://www.lookout-spiele.de/en/games/agricola_ephipparius.html) gives the whole deck a player range starting at one. Its [official one-page rules](https://www.lookout-spiele.de/upload/en_agricola_ephipparius.html_Ephipparius-Regeln_ENWEB_251215.pdf) do not settle Wood Saw or comparisons with no opponents. Neither mathematical empty-set conventions nor the implementation can fill that rules gap. Open Agricola's [E014 code](../../shared/cards/E/E014_WoodSaw.ts) currently returns without offering the effect when there are no other players. This is current behavior awaiting a confirmed rule or an explicit project decision.

### E066 Barn Shed

Barn Shed is the second card in the bottom row of the same [owner-posted physical-card photograph](https://boardgamegeek.com/image/7850922). Its trigger contains the explicit wording "or, in a solo game, you" and rewards using Forest with one grain. This authenticates a printed exception to the other-player trigger. The previous printed-source uncertainty for that solo substitution is resolved.

This is a local exception for Barn Shed. It does not establish that every other-player trigger or neighbor effect substitutes the owner in solo. The comparison above concerns the solo trigger only. It does not audit costs, prerequisites, or differences between print runs.

### M027 Garden Path

The [publisher's Moor glossary, page 11](https://www.lookout-spiele.de/upload/de_agricolare_moorbauern.html_Rules_Agricola-RE-Farmers_EN.pdf#page=11) confirms that Garden Path uses a special marker worth minus 1 point during scoring. Page 10 excludes that marker from effects addressing negative points. These statements establish the marker's scoring treatment, not its solo recipient.

Open Agricola's [M027 metadata and implementation](../../shared/cards/M/M027_GardenPath.ts) describe immediate wood and a marker given to the player on the left. Its implementation gives the wood but guards against assigning the marker to the owner in a one-player game. This is current behavior, not evidence of an official solo exception. The general traveling-card removal rule concerns the card after play; it does not expressly settle who receives this separate marker.

No authenticated publisher card face or designer ruling located during this investigation establishes whether solo receives the marker itself or has no recipient. That recipient question remains unresolved. The rulebook does establish the score of a marker that has a holder.

### M054 Agricultural Implement

Open Agricola's [M054 metadata](../../shared/cards/M/M054_AgriculturalImplement.ts) names Farmland and Cultivation as triggers and describes taking a face-up special-action card, at the usual 0 or 2 food. The current implementation requests `mode: 'take-card'`. That behavior must not be promoted to a confirmed interpretation of the printed effect.

The generic Moor rule on page 4 connects taking a card with executing one printed action. Applying that definition to Agricultural Implement supports an actual special action immediately after the triggering person action. This is an inference from a general rule, pending authentication of the revised card face and any specific ruling. Merely acquiring a card without performing an action is not established by the rulebook.

The old card was numbered M123. Its entry in the [unofficial 2010 compendium](https://m.alavigne.net/Gaming/Agricola/agricola-comp-v9.0.html#M123) links a [2010 discussion](https://boardgamegeek.com/thread/530572/fotm-agricultural-implement). That thread asks about plowing with the last person. MisterG calls the special action a bonus and answers yes, and another user agrees. No publisher or designer role has been established for those respondents. This is community interpretation of the old card, not an authenticated ruling for the revised edition. This research has not established a revised solo exception that permits taking a hidden card, recovering a discarded card, or bypassing the solo use limit. The effect's actual action versus pure card-taking behavior remains a separate maintainer decision if no stronger source is recovered.

### M056 Peat-Cutting Rights

The old card was numbered M122. A [2021 solo question](https://boardgamegeek.com/thread/2605445/peat-cutting-rights-m122-when-playing-solo) transcribes the old card and asks whether its scheduled Cut Peat action works in addition to the normal solo special action. The thread contains two posts. The sole [reply by Desiderata](https://boardgamegeek.com/thread/2605445/article/37052754#37052754) proposes allowing it, expressly framing that answer as the respondent's own ruling. The [public profile](https://boardgamegeek.com/profile/Desiderata) does not establish a publisher or designer role. This is a documented community proposal, not an official answer.

Open Agricola's [M056 metadata and implementation](../../shared/cards/M/M056_PeatCuttingRights.ts) schedule offers four and seven rounds later and refer to taking an appropriate special-action card. The revised publisher rulebook contains no named M056 explanation. A scheduled Cut Peat benefit is reported in both the old transcription and current metadata. Their text does not resolve the revised solo case where the currently available card lacks Cut Peat.

Still unresolved are whether the scheduled benefit requires the current face-up card, whether it consumes that card under the solo procedure, and what happens when no appropriate card is currently available. Searching the draw pile, granting an independent Cut Peat action, and letting an unavailable offer lapse are distinct interpretations. None is confirmed here.

### M057 Taps

A [2025 rules question](https://boardgamegeek.com/thread/3463476/question-about-card-m057-taps) transcribes the revised card as granting exactly one additional turn after all people have been placed, for taking a face-up special-action card at the normal 0 or 2 food. It asks whether the owner may thereby reuse a multiplayer card they already took. Its substantive [reply](https://boardgamegeek.com/thread/3463476/article/45677426#45677426), posted on 2025-02-18 by Ponton, confirms that Taps grants an extra turn while the normal special-card rules still apply. BGG's [public user record](https://api.geekdo.com/api/user/101336) identifies Ponton as Grzegorz Kobiela and links designer and publisher records. The publisher's [Moor rulebook credits, page 8](https://www.lookout-spiele.de/upload/de_agricolare_moorbauern.html_Rules_Agricola-RE-Farmers_EN.pdf#page=8), name Kobiela as the revised-edition editor. This establishes a named editor's ruling. The other replies request and confirm moving the topic to the correct forum. Moving a thread is not a rules ruling.

The reported text and the editor's answer establish an additional turn after the player has placed all people, without waiving normal card availability. Reading that answer together with the solo procedure supports limiting Taps to the currently available face-up card and preserving the ordinary solo discard, retention, and use limits. That solo application is an explicit inference from the editor's general answer and the rulebook. His post answers a multiplayer reuse question, not a solo question. It supplies no permission to search the hidden pile or recover a discarded card. Open Agricola's [extra-turn implementation](../../shared/cards/M/M057_Taps.ts) remains implementation evidence, not the source of this conclusion.

### Card-face and source limits

The local asset files `assets/moor/minor/M027.png`, `M054.png`, `M056.png`, and `M057.png` in `open-agricola-assets` were viewed at commit `dcd4ecbdb5cbf13520d833e0e7f5f872e5f9ec9c`. They contain only the hexagonal illustrations, without card names, numbers, rules text, or player-count marks. They cannot authenticate printed wording. The asset repository describes itself as an unaffiliated fan project's current image source.

The publisher's [Moor product FAQ](https://www.lookout-spiele.de/en/games/agricolare_farmers_re.html) discusses compatibility between editions. No entry for these four cards or their solo cases was present. The revised Moor BGG image index was also inspected for card-photo leads. The checked component photograph [4256998](https://boardgamegeek.com/image/4256998/agricola-farmers-of-the-moor) shows punchboards and the board extension, without readable faces of these four cards. The full revised rulebook, archived original rulebook, and publisher-hosted Karl Stemmer solo variant were checked for their names and card identifiers. Absence from those sources is a bounded search result, not proof that no ruling exists anywhere.

The BGG article and identity checks were read through BGG's own public JSON endpoints, including [M122 posts](https://api.geekdo.com/api/articles?threadid=2605445), [Taps posts](https://api.geekdo.com/api/articles?threadid=3463476), and the linked public user records. Direct thread pages returned a Cloudflare verification screen or HTTP 403 during this research.

### Maintainer decision still required

With the existing decision to introduce no new solo banlist, which local interpretations should Open Agricola adopt now, and which should remain explicitly undetermined? The unresolved choices include Wood Saw's empty-opponent comparison, Garden Path's solo marker recipient, Agricultural Implement's pure card-taking versus executing an actual special action, and Peat-Cutting Rights when the current face-up card cannot supply Cut Peat. The decision should also record whether it accepts the stated normal-availability inference for Taps. Barn Shed's printed solo substitution already has direct evidence. Any chosen fallback should be labeled a project decision. It must not silently create a general self-neighbor rule, empty-opponent comparison rule, hidden-pile access, or unlimited special-action use.
