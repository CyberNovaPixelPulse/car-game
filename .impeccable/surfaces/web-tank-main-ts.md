---
version: 1
slug: "web-tank-main-ts"
primary_target: "web/tank-main.ts"
related_targets: ["web/tank.css"]
---

# Lobby and role select (manual plate)

Scope: entry menu (create/join) and room lobby rendered by web/tank-main.ts menu() and lobby(), and, since the second round, the three battle workstations rendered by station() (gunner, loader interior and MG, blind driver). Mode: Operate. Both surfaces share the manual world through html[data-surface]; battle keeps its incumbent layout because tests pin headings and HP in view at 720px height.

Battle extension rule: on the battle surface red ink marks only danger that needs action now (enemy aiming, a hit inside its one-second window, ejection, stun, jam, MG overheat, a failed battle). Past damage, a won battle and normal MG heat stay in ink. The live 3D scene is the plate's figure, framed by an ink rule; overlays are paper labels with ink rules. The driver plate carries the hull seat key with seat 1 in red and no battlefield information.

Audience and task: three friends on their own voice call, each at a desktop with a physical keyboard, gather in a private room, each claims one unique crew position, prepares, and the host starts. User complaint that drove the redesign: the lobby read as a generic web form.

Constraints: keep all copy, rules, testids, accessible names (擔任駕駛 etc., 準備, 開始戰鬥, 建立房間, 加入房間, 乘員名稱, 房間代碼, headings 與隊友集合 / 乘員集合), crew-list li per real member, keyboard focus, narrow-viewport desktop-keyboard notice. No military insignia, unit markings or flags.

## Direction contract

THESIS: Choosing a role is claiming a numbered crew position on a wartime technical-manual plate of the Sherman, seen from above. Refuses the category default of a dark game lobby with hero art and character cards, and the incumbent dark settings form.

OWN-WORLD: Two-colour letterpress on manual paper. Paper #ebe5d2 ground, deeper paper #e2dbc4 for the side panel, ink #1c1c18 for line art, rules, text and filled primary buttons, one second ink red #a3352b reserved for "you" and the active selection and the room code. Square corners, 1.5–2px ink rules, Noto Serif TC 700/900 for headings, numerals and the room code, the system sans for body. No shadows, no rounded cards.

STORY: The visitor sees the tank's crew positions before any control, understands there are exactly three seats, sees which are claimed by whom, claims theirs, and knows what everyone is waiting for.

FIRST VIEWPORT: Header with the serif title, figure caption line and the voice-call sentence over a 2px ink rule. Lobby: left plate column holds the hull top-view line drawing with seats 1 driver, 2 gunner, 3 loader marked as numbered circles (ink when claimed, red when yours, open when free) beside a numbered callout list; each callout is the real role button plus its task sentence and who holds it. Right panel: room code in large red serif, crew table (ul) with number, name, position, readiness, then the waiting message and prepare / start / leave buttons. Menu: same plate with the diagram unclaimed, forms on the right.

FORM: Field-manual plate, candidate 1 of 7 on the ordered list (IMPECCABLE'S PICK, chosen by the user over the rolled enamel-plaque direction). seed:0712ef5e71ead07d
Signature move: the hull diagram's seat markers mirror the authoritative room state in all three browsers as roles are claimed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
