# Morrow on the website — voice lines

Morrow speaks only around the glass die (plus one optional line when a visitor clicks his portrait). The die can now be carried anywhere on the page, so `site_morrow_dropped.mp3` is the one that matters most: it is already on screen as text when someone drops the die off the mat. Nothing plays until the visitor has touched the die or a button, the speaker button mutes him, and every line is also shown as a caption.

## Recording

Same voice and mix as the game (`C:\lumina_dice\VOICE_SCRIPT.md`): warm, intelligent, quietly amused; never an announcer. Dry mono MP3, 48 kHz, 160 kbps or higher, about −18 to −16 LUFS, true peak no higher than −3 dBTP, 100–150 ms of silence before the words and 200–300 ms after.

Record only the quoted words. One MP3 per file name.

**Put the new files in:** `C:\glass-and-fortune-website\public\audio\voice\`

## New lines (10 files)

| File | Line | When it plays | Delivery |
|---|---|---|---|
| `site_morrow_invite_01.mp3` | “Go on. Pick it up. It doesn’t bite.” | The die sits untouched for a while, once sound is allowed | Inviting, a faint smile on “bite” |
| `site_morrow_invite_02.mp3` | “You may pick it up, you know. That is what it’s for.” | Same, second time | Patient, amused |
| `site_morrow_first_pickup.mp3` | “There. Now throw it. Gently, or not. The table has seen worse.” | The first time the visitor lifts the die | Encouraging, dry finish |
| `site_morrow_landed_01.mp3` | “No prophecy. Just a very good throw.” | After the first throw lands, then now and then | Warm, matter-of-fact |
| `site_morrow_landed_02.mp3` | “It landed. Glass usually does, eventually.” | Now and then after a throw | Deadpan |
| `site_morrow_landed_03.mp3` | “Again, if you like. It never tires of it.” | Now and then after a throw | Relaxed |
| `site_morrow_landed_04.mp3` | “Tally wrote that down. I have no idea why.” | Now and then after a throw | Mild bafflement, fond of Tally |
| `site_morrow_hard_throw.mp3` | “Gently. That is the only one I brought.” | A very hard throw into the rail | Mock alarm, not cross |
| `site_morrow_dropped.mp3` | “That is not the mat. Shall I fetch it?” | The die is dropped away from the mat and falls out of sight | Unimpressed but willing; the line is on screen already |
| `site_morrow_many_throws.mp3` | “Still throwing? The real table has five of these, and a great deal more mischief.” | Around the twelfth throw, once | Pleased, a little sly |

## Lines reused from the game (already recorded, copied automatically)

| Game file | Line | When it plays on the site |
|---|---|---|
| `morrow_idle_05.mp3` | “You have been considering that die for some time. It remains a die.” | The visitor holds the die for a while without throwing |
| `morrow_idle_03.mp3` | “Do not stare too deeply into the dice. They become self-conscious.” | Same, the next time |
| `morrow_menu_first_visit.mp3` | “Ah. A new guest. I am Morrow, keeper of the table…” | Optional: the visitor clicks Morrow’s portrait in The Game section |

## How often

At most one Morrow line every 20 seconds, never over another, and never more than once per visit for the invite, first pick-up, hard-throw and many-throws lines. After the first landing, roughly one throw in four gets a landing line.
