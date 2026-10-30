# Worker Folks: Hiring

A mod for **Melvor Idle v1.3.1** (base game, Throne of the Herald, Atlas of Discovery and
Into the Abyss supported). Hire **Folks**: workers who keep a non-combat skill running
while you fight, raid or train something else.

## How it works

1. Open the **Shop → Worker Folks** category and buy the **Trainee Licence** (GP plus a few
   items from the early dungeons). It also gives you your first **Shift Slot**.
2. **Hire a Trainee**. Each Folk you own makes the next one of that tier 20% more
   expensive, and your crew can never be larger than the number of skills Folks can hold
   (every gathering, crafting and artisan skill, including expansion and mod skills, but
   never combat).
3. Open any skill page (Woodcutting, Smithing, Cartography...). A **Worker** box sits under
   the skill header: press the Worker button and pick **You** or one of your Folks in the
   window that opens (one tile per Folk with its Produce Rate, effects, wage and status). With a Folk chosen, start the
   skill exactly as you always do (click the tree, press Create, start the survey...) and the
   Folk takes the job. It keeps working while you do anything else. Press **Stop** in the
   Worker box to end the shift, or switch the box back to **You**: a working Folk then keeps
   going until you start an action on that page yourself. Picking a Folk that is busy on
   another skill does not interrupt it either: it moves over when you start the new skill.
   Skills added by other mods get a Worker box too, as long as they have a skill page.
4. The **Hiring** page (sidebar, under the passive skills) is the crew overview. Its
   **Overview** block shows who is at work (trouble first), what your Folks made this session,
   the Payroll Reserve once unlocked, and your next Hiring unlock. Below it, a card per Folk
   with its status, the skill it holds, what it is working on, and a Stop button; what needs you
   (a strike, a debt, a Folk out of inputs or with bank and room full) sits right under its name,
   with the button that fixes it. A card shorter than its neighbours fills the space with the
   Folk's daydream, a new one every so often. Fold a block
   to its title or drag blocks and cards into your own order; Reset layout puts it back. The usual
   skill minibar floats at its side (mastery, milestones, the pet once found, quick-equip of
   Hiring gear, and the relics button in Ancient Relics).
5. **Shift Slots** limit how many Folks work at the same time. Buy more in the Shop; your
   highest Licence caps them (Trainee 2 · Apprentice 4 · Journeyman 7 · Master 10 · Foreman
   unlimited).
6. Folks work **offline** like your own action. The offline summary lists what each Folk did.

## Tiers

| Role | Produce Rate | Effects | Wage per hour |
|---|---|---|---|
| Trainee | 60 | +10% action time, Never Finds Pets | 75,000 GP |
| Apprentice | 80 | Never Finds Pets | 300,000 GP |
| Journeyman | 100 | — | 1,000,000 GP |
| Master | 120 | -5% action time, +10% Preservation | 3,000,000 GP |
| Foreman | 140 | -10% action time, +20% Preservation, +3% XP To Other Working Folks (Max +15%, +20% from Hiring 99) | 8,000,000 GP |

**Produce Rate** below 100 is the chance an action succeeds; a failed action gives nothing
(crafting inputs are still used). Above 100, the excess is the chance of a second full
batch. Folks never stun or hurt you in Thieving. Folks use everything you have earned
(pets, shop upgrades, potions, Agility, Astrology, Township, mastery tokens) but **not**
the equipment you wear.

Higher Licences need the previous Licence, a Hiring level (20 / 40 / 60 / 80) and items
from harder content. The Foreman Licence asks for different items depending on the
expansions you own.

## Qualification

A Folk works a skill only once your own level in it is high enough for its tier: 10 for a
Trainee, 30 for an Apprentice, 50 for a Journeyman, 70 for a Master and 90 for a Foreman
(Alt. Magic uses your Magic level). From the Folk's mastery 50 the level of the tier below
is enough. In the Worker box a Folk you don't qualify for is greyed out with the level it
needs; one that already holds the skill waits, and its card and the Worker box say why. A
Folk that stops qualifying while it works (after a promotion, say) stops, keeps its skill
and starts again once you reach the level. The **Qualification** setting (Hiring section,
on by default) turns the rule off.

## Gear

Press **Gear** on a Folk card to open its gear window (**Details** holds the mastery perks;
the Overtime and Own stock switches sit under the Folk's work). Trainees carry a Cape and Gloves;
Apprentices add armour; Journeymen add Amulet, Ring and a Consumable; Masters add two
Summon slots; Foremen add the Gem (Atlas of Discovery) and Enhancement slots (Into the
Abyss). Click a slot to pick an item from your bank. For a Folk that already has a skill the
list shows only items that help that skill; a Folk without one sees every skilling item; tick
"Show all" for everything that fits, combat gear included. Items move out of your bank while equipped and come back when unequipped
or when the Folk is fired or dies, as far as your bank has space: an item with no free bank slot (and none of its
kind in the bank) is lost with the Folk. Equip requirements use your own levels.

A Folk works with **its own gear only**: your equipped items never count for a Folk, and
the Folk's items never count for you. Item synergies between the Folk's own items apply,
Max and Completion capes carry every skillcape effect, and two Summon tablets with an
unlocked synergy apply it.

**Used-up items.** A familiar tablet is spent once per action of the skill it serves (an Ent
on Woodcutting, never on Fishing), after the Folk's own preservation chance; you receive
the Summoning XP for every tablet a Folk uses. Items in the Consumable slot are used per
action the same way. Charge gloves draw on the same charge pool you see in the shop and
stop working at zero; buying charges turns them back on. When a stack runs out the slot
empties and a notification names the Folk. Your own equipped tablets, consumables and
charges are never spent by a Folk's work. From Hiring 50 Folks find Summoning marks at half
your chance; before that they find none.

## A Folk's room

Every Folk has a room, measured in **hours of work**: 2 h for a Trainee up to 8 h for a
Foreman. A bar on its card shows how full it is; hover it for the list.

**A full bank.** An item a Folk makes that your bank can't take (a new kind and no free slot)
waits in its room instead of being lost, and goes to the bank on its own once a slot frees.
When the room is full too, the Folk stops ("Bank and room full").

**Own stock.** The **Own stock** switch on a card makes the Folk take its recipe's inputs
only from its room, never from your bank: a Folk on Steel Bars can't eat the Coal you keep
for yourself. **Restock** on the card fills the free room with the inputs of its current
recipe from your bank (as many actions as fit and as your bank has) and starts the Folk
again; the arrow beside it opens a slider to restock only up to the hours you pick, with
what that takes from your bank shown before you press it. When the stock runs out, the Folk stops ("Out of inputs"); its wages don't wait.
Leftovers from an earlier recipe are used by any later recipe that needs them. Switching
Own stock off sends the stock to your bank as far as it has space; what finds no free slot
is lost, and the card warns you beside the switch.

**Bags.** A Folk wearing a bag in its Cape slot gets a bigger room, in place of a skillcape:
the **Folk Satchel** (Crafting 20: 40 Leather, 1 Amulet of Looting) adds a third of the
tier's bag room, the **Folk Pack** (Crafting 50: a Satchel, 10 Bobby's Pockets, 150
Mithril Bars, 6 Amulets) two thirds, the **Folk Frame Pack** (Crafting 80: a Pack, 250 Black
Dragonhide, 400 Runite Bars, 12 Amulets) all of it: up to 4 h for a Trainee and 12 h for a Foreman. The recipes
are with the game's Bags in Crafting (full game). A bag does nothing for you.

## Folk health

Folks have hitpoints by tier (Trainee 300, Apprentice 500, Journeyman 700, Master 900,
Foreman 1,200), shown as a bar on the card. A Folk caught while Thieving is stunned like
you would be and takes the NPC's hit itself; you never take damage from a Folk's work.
A failed Produce Rate roll counts as caught, and the Folk's stealth comes from its own gear, so each NPC on the
Thieving page shows the Folk's own success rate under yours. Like you, a Folk stops after a stun unless "Continue
Thieving after being stunned" is on.
Below 60% health the Folk eats **your selected food** (the food slot you use in combat)
until it is back to full, so keep food equipped while a Folk thieves. Folks regenerate 1% of their max HP every ten
seconds. A Folk that drops to zero dies: its gear returns to your bank as far as there is space (the rest is lost, and the
frozen slot says what), it leaves the crew,
and its slot stays frozen for 24 hours of real time before a new hire can take it.
Abyssal NPCs hit Folks at a tenth of their listed damage.

## Promotions and firing

A Folk's card has **Promote** and **Fire** buttons. Promotion raises the Folk one tier and
needs the target tier's Licence, the Folk's mastery (20 / 40 / 60 / 80 for Apprentice /
Journeyman / Master / Foreman), a diploma item (Amulet of Torture, Amulet of Fury,
Infernal Core, Elder Crown or FrostSpark Amulet with Throne of the Herald) and a fee of
60% of that tier's next hire price. The Folk keeps its skill, mastery and anything it
carries, and keeps working if you still qualify it for its skill (the popup warns when the
new tier needs more of your level). Firing asks for confirmation (listing what goes back to your
bank and, in red, what a full bank can't take and would be lost), returns carried items to the bank, clears the slot's mastery and refunds nothing. It also costs a **severance**: 10%
of what the Folk cost you (its hire price and its promotion fees), 5% from Hiring 45 and
nothing from Hiring 90. A Folk hired before this rule counts as having cost its tier's
first-hire price. Fire stays disabled while you can't pay the severance.

## Traits

A Folk learns **traits** from what it does and what happens to it: long hours in one skill,
how it is paid, what it is promoted to, its failures and hard knocks. Some are good, some
are a mixed bag, some are bad; a few bad ones fade again, the rest stay. You see a trait only
once it is learned: a notification says so, the trait's icon appears on the card (its
tooltip says what it does) and **Traits** on the card lists them. A Folk has four trait
slots, opened by its mastery at 1, 25, 50 and 99; a trait learned while every open slot is
full waits for the next one that frees. From Hiring 15, **Forget** removes a trait for a
quarter of the tier's next hire price, and the Folk could learn it again only from the
start. Traits stay through promotion and leave with a Folk that is fired or dies.

## Wages, reserve and strikes

Every action a Folk completes costs its hourly wage pro-rated by the action's length
(failed actions included). Wages are deliberately steep: a Folk on a strong money-maker
pays for itself with some to spare, a Folk on anything else runs at a loss, and a big crew
can out-eat even a fully built Township. A fresh Folk earns 40% of its tier wage and gets
raises with mastery: 55% at 50, 74% at 90 and the full wage at 99, so the crew costs more
as it gets better.
Wages come from the **Payroll Reserve** on the Hiring page first, then from your bank. In
the Abyssal Realm wages are charged in Abyssal Pieces.

If neither can pay, the Folk keeps working unpaid for a grace of **15 minutes of work** (30
from Folk mastery 25, 15 more from the 25% mastery pool checkpoint) and then **strikes**.
You are told in time: a notification the moment a Folk goes unpaid (with the amount owed
and the minutes left), another when the Payroll Reserve drops under an hour of wages, an
amber line on the card and in the Worker box, and the offline summary lists Folks that
went into debt or struck while you were away. Put money back before the grace runs out
and the owed wages are collected on the next action, ending the "In debt" state. Otherwise
the skill stops, the Shift Slot is freed and the card turns red with the amount owed
(hover a grey Settle or Apologise to see how much you are short).
Settling costs the owed wages plus severance (5% of that tier's next hire price). After
settling, the Folk cools down (Trainee 30 min · Apprentice 1 h · Journeyman 2 h ·
Master 4 h · Foreman 8 h, offline time counts). Pay three times the severance instead to
skip the cooldown.

## Hiring levels

Hiring gains XP for every hour your Folks work, by tier: Trainee 60, Apprentice 140,
Journeyman 220, Master 380, Foreman 600 (failed actions count, as they do for wages; the rate
is a setting). It shows as a "+N Hiring XP" notification like any other skill; delivered Work
Orders pay more. Open
**View Milestones** on the Hiring page for the full list. The levels unlock management
features: the Payroll Reserve at 5 (24 h of the whole crew's wages, growing to 72 h at 35,
7 days at 65 and 30 days at 95), the Work Orders board at 8 (more orders at 30 and 70, the
reroll at 50), promotions at 10, forgetting a trait at 15, Licences at 20 / 40 / 60 / 80, the
apology bonus at 25, half the firing severance at 45, Summoning marks for Folks at 50,
automatic restart of a Folk's skill after a settlement at 55, cheaper Overtime (×1.5 wages)
at 85, no firing severance at 90, a free Shift Slot and a +20% Foreman crew bonus cap at 99
and, with Throne of the Herald, -10%
wages at 100, a second free Shift Slot at 110 and 50% promotion fees at 120. Locked
buttons show the level they need. In Ancient Relics the milestones above your level cap
are marked "raise level cap", and Hiring can appear among the random cap increases.

## Work Orders

From Hiring 8 the Hiring page has a **Work Orders** board: orders for items your Folks make.
Only what a Folk's work puts in your bank counts, from the moment the order appears; what you
make yourself doesn't, and selling or using the items later changes nothing. An order asks for
about 2 (Small), 6 (Medium) or 16 (Large) hours of one Folk's work on a recipe you have
unlocked, picked from the newest recipes of the skills a Folk can work (none from the Abyssal
realm for now).

A delivered order pays at once:

- **GP**: a share of the wages its own work cost you, rolled per order from ×0.5 to ×3 and
  shown on its card. A failed action's wage counts toward the order the Folk is filling. With
  wages off (No sweat) orders pay no GP.
- **Hiring XP**: a tenth of a level's worth (Small), a fifth (Medium) or two fifths (Large), at
  your Hiring level when it's delivered.
- **Items**: a Medium order adds a Hiring mastery token. A Large one adds one extra shown on
  its card: 1–2 tokens, a diploma (an item your highest Licence's promotion asks for), a stack
  of fishing junk or a handful of random gems.

Every 24 hours of game time, offline included, the board refreshes: delivered orders and ones
nobody started go, and an order in progress gets one more day before it goes undelivered. A
delivered order's place stays empty until the refresh. Hiring 8 gives 2 Small orders, 30 three
with Medium ones, 70 four with Large ones; from 50 a **Reroll** (1,000,000 GP) replaces every
order nobody has started. Delivered and expired orders while you were away show in the Welcome
Back summary. The board is a block on the Hiring page you can move and fold like the Overview.

## Gear, pet and relics

**Overseers Outfit**: Hat, Body, Leggings and Boots in the Shop → Township tab right before
the Skilling Outfit Upgrade, with the same price (100,000 GP each) and the same gating
(Township level 10 / 20 / 40 / 60 and 20 / 40 / 60 / 80 tasks). Each piece gives +2% Hiring
Skill XP; with all four worn you also get +8% Hiring Mastery XP. The **Hiring Skillcape** (Shop → Skillcapes, just before the Cape of Completion, Hiring 99,
1M GP) gives -5% Folk wages and -10% strike cooldown; with Throne of the Herald the
**Superior Hiring Skillcape** (Hiring 120, 10M GP) gives -10% wages, -20% cooldown and
+15 min of strike grace. Hiring gear is worn by **you** (the outfit, the capes and the Lesser
Relic never show up in a Folk's gear window); the wage, grace and cooldown effects reach
every Folk. The bags are the other way round: made for a Folk's Cape slot (see "A Folk's room"). Wage reliefs from the pool, gear, the pet, relics
and the Hiring 100 milestone are capped at 30% of the Folk's current raise (12% for a fresh
Folk, 30% at mastery 99); they soften the raises, never reverse them.

**Bruno**, the Hiring pet, can turn up after any finished Folk action. The chance is tiny
(it grows with your Hiring level, and the whole crew shares one roll, so a bigger crew
does not find him faster); expect well over a hundred hours of Folk work. He gives -2%
Folk wages and +10 min of strike grace.

In the **Ancient Relics** game mode Hiring has its own relic set, found through Folk
actions at the usual relic odds and on reaching Hiring 20 and 99: Hiring Relic 1 (+50%
Hiring Mastery XP), Relic 2 (-10% Folk wages), Relic 3 (+10% global GP, except item sales),
Relic 4 (-3% interval for all non-combat skills), Relic 5 (+25% Hiring Skill XP, -25% strike
cooldown) and, with all five found, the Hiring Master Relic: overtime costs normal wages (the
-20% action time stays), +5% of your max hit added to your min hit, +5% non-combat skill XP.
Folk actions in that mode also have a 0.1% chance to drop 300 **Hiring Lesser
Relics**, a consumable for **your** Consumable slot (-5% Folk wages, +5% Hiring Skill XP, -5%
damage taken) that spends a charge on every Folk action and every attack of yours, like the
game's own Lesser Relics.

**The Steward**, Hiring's own Summoning familiar: Summoning 30, tier 2 (8 Green and 6 Silver shards and
1,000 GP a craft, like the Leprechaun's coin). Worn by **you** in a Summon slot, it gives every Folk +5% skill
XP and spends one charge per 30 seconds of crew work, whoever is working (a bigger crew spends no faster);
its mark turns up at the same beat while your Folks work. Pair it with a Leprechaun (-5% Folk wages), a Monkey
(+10 min of strike grace), a Devil (-10% strike cooldown), an Ent (+10% Hiring Skill XP), an Octopus (+10% Hiring
Mastery XP) or a Pig (another +5% skill XP for every Folk). In a Folk's own Summon slot it does nothing.

## Settings

Mod Settings → Worker Folks: wage difficulty, a preset from **No sweat** (free labour, no
strikes; a strike or unpaid wages from before are only on hold and come back if you switch to a paid
difficulty) through Easy (¼), Relaxed (½), **Standard** (full wages, the default), Tense (×1.5),
Hard (×2), Brutal (×3) to **Evil hardcore** (×5); Abyssal
Pieces wages on/off, Hiring XP rate (default 100%), and **Hide Folks' gain popups**
(off by default: when on, the XP, item, currency and mastery popups from your Folks' work stay hidden;
level-ups, warnings and your own popups still show).

## Languages

Every text of the mod comes from its language files. Only English ships for now; the
game's language setting picks the matching file when one exists.

## Game modes

Works in Standard, Hardcore, Adventure (Hiring is bought like any skill) and Ancient
Relics (Hiring starts unlocked and capped at 10 like every skill; preservation effects are
replaced by a small XP bonus because the mode disables preservation; Hiring has its own
relic set, see above).

## Compatibility

**Not compatible with Multitasking** (by Corgan, and its re-uploads). Both mods change the
same mechanic: which skill the game treats as active and what keeps running when you start
another one. With Multitasking loaded, Worker Folks switches itself off, shows a message
explaining why, and registers nothing; disable one of the two in the Mod Manager and reload.

Other mods' custom skills get a Worker box where their skill follows the game's skill
classes. Mods that only add items, modifiers or UI are unaffected.

## Removing the mod

Your save stays loadable without the mod, but the game drops everything the mod added the
first time it saves without it: your Hiring level, your Folks, Licences, Shift Slots, the
Payroll Reserve and anything Worker Folks added to your bank. Turning the mod back on later
starts Hiring from scratch.

Before removing it: open each Folk's **Gear** and take its items back (or Fire the Folk,
which returns them while your bank has space), and stop every Folk. A skill a Folk was working when you saved may
otherwise look busy without progressing until you click its action once.

## Credits

Built by a developer using assistive AI. The multi-skill idea comes from the
Multitasking mod by Corgan.

## License

MIT. The source is included in the zip; see `LICENSE`.

The MIT License covers the mod's code and its own art. Nine icons are built from Melvor Idle's
own sprites, recoloured or reassembled with the Hiring badge, and stay the property of Games by
Malcs: `assets/skillcape.webp`, `assets/skillcape_superior.webp`, `assets/lesser_relic.webp`,
the Overseers Outfit pieces `assets/town_helmet.webp`, `assets/town_body.webp`,
`assets/town_legs.webp`, `assets/town_boots.webp`, and the Steward tablet and mark
`assets/steward.webp`, `assets/mark_steward.webp`. They are not under the MIT License and are
included only so the mod looks at home in the game. Melvor Idle is a trademark of Games by Malcs;
this mod is not affiliated with or endorsed by them.
