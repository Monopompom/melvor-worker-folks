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
   with its status, the skill it holds, what it is working on, and a Stop button. Fold a block
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
| Foreman | 140 | -10% action time, +20% Preservation, +3% XP To Other Working Folks (Max +15%) | 8,000,000 GP |

**Produce Rate** below 100 is the chance an action succeeds; a failed action gives nothing
(crafting inputs are still used). Above 100, the excess is the chance of a second full
batch. Folks never stun or hurt you in Thieving. Folks use everything you have earned
(pets, shop upgrades, potions, Agility, Astrology, Township, mastery tokens) but **not**
the equipment you wear.

Higher Licences need the previous Licence, a Hiring level (20 / 40 / 60 / 80) and items
from harder content. The Foreman Licence asks for different items depending on the
expansions you own.

## Gear

Press **Gear** on a Folk card to open its gear window (**Details** holds the mastery perks and
the Overtime toggle). Trainees carry a Cape and Gloves;
Apprentices add armour; Journeymen add Amulet, Ring and a Consumable; Masters add two
Summon slots; Foremen add the Gem (Atlas of Discovery) and Enhancement slots (Into the
Abyss). Click a slot to pick an item from your bank. For a Folk that already has a skill the
list shows only items that help that skill; a Folk without one sees every skilling item; tick
"Show all" for everything that fits, combat gear included. Items move out of your bank while equipped and come back when unequipped
or when the Folk is fired. Equip requirements use your own levels.

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
charges are never spent by a Folk's work. Folks do not discover Summoning marks.

## Folk health

Folks have hitpoints by tier (Trainee 300, Apprentice 500, Journeyman 700, Master 900,
Foreman 1,200), shown as a bar on the card. A Folk caught while Thieving is stunned like
you would be and takes the NPC's hit itself; you never take damage from a Folk's work.
Below 60% health the Folk eats **your selected food** (the food slot you use in combat)
until it is back to full, so keep food equipped while a Folk thieves. Folks regenerate 1% of their max HP every ten
seconds. A Folk that drops to zero dies: its gear returns to your bank, it leaves the crew,
and its slot stays frozen for 24 hours of real time before a new hire can take it.
Abyssal NPCs hit Folks at a tenth of their listed damage.

## Promotions and firing

A Folk's card has **Promote** and **Fire** buttons. Promotion raises the Folk one tier and
needs the target tier's Licence, the Folk's mastery (20 / 40 / 60 / 80 for Apprentice /
Journeyman / Master / Foreman), a diploma item (Amulet of Torture, Amulet of Fury,
Infernal Core, Elder Crown or FrostSpark Amulet with Throne of the Herald) and a fee of
60% of that tier's next hire price. The Folk keeps its skill, mastery and anything it
carries, and keeps working. Firing asks for confirmation, returns carried items to the
bank, clears the slot's mastery and refunds nothing.

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
the skill stops, the Shift Slot is freed and the card turns red with the amount owed.
Settling costs the owed wages plus severance (5% of that tier's next hire price). After
settling, the Folk cools down (Trainee 30 min · Apprentice 1 h · Journeyman 2 h ·
Master 4 h · Foreman 8 h, offline time counts). Pay three times the severance instead to
skip the cooldown.

## Hiring levels

Hiring gains 5% of every skill XP drop your Folks earn (the share is a setting) and shows it
as a "+N Hiring XP" notification like any other skill. Open
**View Milestones** on the Hiring page for the full list. The levels unlock management
features: the Payroll Reserve at 5 (24 h of the whole crew's wages, growing to 72 h at 35,
7 days at 65 and 30 days at 95), promotions at 10, Licences at 20 / 40 / 60 / 80, the
apology bonus at 25, automatic restart of a Folk's skill after a settlement at 55, cheaper
Overtime (×1.5 wages) at 85, a free Shift Slot at 99 and, with Throne of the Herald, -10%
wages at 100, a second free Shift Slot at 110 and 50% promotion fees at 120. Locked
buttons show the level they need. In Ancient Relics the milestones above your level cap
are marked "raise level cap", and Hiring can appear among the random cap increases.

## Gear, pet and relics

**Overseers Outfit**: Hat, Body, Leggings and Boots in the Shop → Township tab right before
the Skilling Outfit Upgrade, with the same price (100,000 GP each) and the same gating
(Township level 10 / 20 / 40 / 60 and 20 / 40 / 60 / 80 tasks). Each piece gives +2% Hiring
Skill XP; with all four worn you also get +8% Hiring Mastery XP. The **Hiring Skillcape** (Shop → Skillcapes, just before the Cape of Completion, Hiring 99,
1M GP) gives -5% Folk wages and -10% strike cooldown; with Throne of the Herald the
**Superior Hiring Skillcape** (Hiring 120, 10M GP) gives -10% wages, -20% cooldown and
+15 min of strike grace. Hiring gear is worn by **you** (the outfit, the capes and the Lesser
Relic never show up in a Folk's gear window); the wage, grace and cooldown effects reach
every Folk. Wage reliefs from the pool, gear, the pet, relics
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

## Settings

Mod Settings → Worker Folks: wage difficulty, a preset from **No sweat** (free labour, no
strikes; a strike or unpaid wages from before are only on hold and come back if you switch to a paid
difficulty) through Easy (¼), Relaxed (½), **Standard** (full wages, the default), Tense (×1.5),
Hard (×2), Brutal (×3) to **Evil hardcore** (×5); Abyssal
Pieces wages on/off, Hiring XP share of Folk skill XP (default 5%), and **Hide Folks' gain popups**
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
which returns them), and stop every Folk. A skill a Folk was working when you saved may
otherwise look busy without progressing until you click its action once.

## Credits

Built by a developer using assistive AI. The multi-skill idea comes from the
Multitasking mod by Corgan.

## License

MIT. The source is included in the zip; see `LICENSE`.

The MIT License covers the mod's code and its own art. Seven icons are built from Melvor Idle's
own sprites, recoloured or reassembled with the Hiring badge, and stay the property of Games by
Malcs: `assets/skillcape.webp`, `assets/skillcape_superior.webp`, `assets/lesser_relic.webp` and
the Overseers Outfit pieces `assets/town_helmet.webp`, `assets/town_body.webp`,
`assets/town_legs.webp`, `assets/town_boots.webp`. They are not under the MIT License and are
included only so the mod looks at home in the game. Melvor Idle is a trademark of Games by Malcs;
this mod is not affiliated with or endorsed by them.
