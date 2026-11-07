---
version: 1
slug: "web-tank-main-ts"
primary_target: "web/tank-main.ts"
related_targets: ["web/tank.css", "web/tank-station.ts", "web/tank-navigation.ts", "web/tank-driver-armour.ts", "web/tank-repair.ts"]
---

# Manual entry, lobby and full-viewport battle

Scope: entry and lobby retain the accepted manual plate. Mode: Operate. The precisely specified #30 extension changes battle to a full-viewport scene while retaining the committed Claude tank/Normandy assets and interior. The inherited lobby direction contract below remains scoped to entry/lobby; its paper composition is not a requirement to frame battle. Battle uses crisp DOM/SVG text with the hud tokens in DESIGN.md, without blur, decorative shadows, a paper frame or a scene-external status strip. This is a code-led extension with no approved image comp, comp-diff or new visual-world roll.

Battle layout: role/shared state and independent hull/main-gun direction top-left; local native quality, fullscreen, leave and loader sound controls top-right; current work bottom-right; shared north-up terrain map bottom-left. The scene and HUD fill the available page and the complete station is the local Fullscreen API target. HUD inset is 16px; overview/work widths are 300px/340px; navigation is 192px. Danger and reconnect messages occupy upper center, keeping normal sights clear. Driver armour is opaque physical h60/v16 opening geometry, fixed to the hull, rather than an HTML border. Loading/repair retain the existing interior; repair/calibration and jam use its central workspace. Result/return replaces central tasks while HP and leave remain visible.

Battle state language: hull arrow and independent gun line have separate geometry and labels. Current enemy contacts are filled warm squares; last-known contacts are hollow and fade at their frozen observation position over five shared game seconds, with current/old counts and age wording. Interior loading/repair only read team intelligence. Calibration has a grey-green track, broad pale-brass normal sector, smaller bright perfect sector, light needle and exact angle text. Normal/perfect/failure, damage/ejection/stun/overheat and reconnect have explicit text and numbers. Preserve accessible names/testids and authority/lifecycle behavior.

Battle adaptation: at height ≤800px, driver navigation is 160px and active calibration shifts down 32px with a 160px dial, compact text and redundant title/requirements hidden. Keep current state, target ranges and R/space/C/Tab visible. Normal 1280×720 and 1440×1050, page/fullscreen, all three jobs and loading/MG/repair are the supported visual review targets. Narrow entry/lobby remains readable with natural scrolling and the physical-keyboard notice; no touch-play promise is added.

Audience and task: three friends on their own voice call, each at a desktop with a physical keyboard, gather in a private room, each claims one unique crew position, prepares, and the host starts. User complaint that drove the redesign: the lobby read as a generic web form.

Constraints: keep all copy, rules, testids, accessible names (擔任駕駛 etc., 準備, 開始戰鬥, 建立房間, 加入房間, 乘員名稱, 房間代碼, headings 與隊友集合 / 乘員集合), crew-list li per real member, keyboard focus, narrow-viewport desktop-keyboard notice. No military insignia, unit markings or flags.

## Inherited entry/lobby direction contract

THESIS: Choosing a role is claiming a numbered crew position on a wartime technical-manual plate of the Sherman, seen from above. Refuses the category default of a dark game lobby with hero art and character cards, and the incumbent dark settings form.

OWN-WORLD: Two-colour letterpress on manual paper. Paper #ebe5d2 ground, deeper paper #e2dbc4 for the side panel, ink #1c1c18 for line art, rules, text and filled primary buttons, one second ink red #a3352b reserved for "you" and the active selection and the room code. Square corners, 1.5–2px ink rules, Noto Serif TC 700/900 for headings, numerals and the room code, the system sans for body. No shadows, no rounded cards.

STORY: The visitor sees the tank's crew positions before any control, understands there are exactly three seats, sees which are claimed by whom, claims theirs, and knows what everyone is waiting for.

FIRST VIEWPORT: Header with the serif title, figure caption line and the voice-call sentence over a 2px ink rule. Lobby: left plate column holds the hull top-view line drawing with seats 1 driver, 2 gunner, 3 loader marked as numbered circles (ink when claimed, red when yours, open when free) beside a numbered callout list; each callout is the real role button plus its task sentence and who holds it. Right panel: room code in large red serif, crew table (ul) with number, name, position, readiness, then the waiting message and prepare / start / leave buttons. Menu: same plate with the diagram unclaimed, forms on the right.

FORM: Field-manual plate, candidate 1 of 7 on the ordered list (IMPECCABLE'S PICK, chosen by the user over the rolled enamel-plaque direction). seed:0712ef5e71ead07d
Signature move: the hull diagram's seat markers mirror the authoritative room state in all three browsers as roles are claimed.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Provenance and finish boundary

The FORM line and seed:0712ef5e71ead07d are unchanged from accepted base 2e2a621. The old machine roll record is unavailable; the line records inherited history, not a newly verified roll. #30 explicitly approves retaining the lobby identity and extending battle as specified above. Do not fabricate a historical roll, rerun a concept seed or reopen the already confirmed choices.

The independent finish reviewer returned SHIP after directly opening all 64 required valid images in `.impeccable/review/spec30/manifest.json`; no material rendered correction was requested. This documenter pass records the implemented system after that verdict. The verdict covers that rendered packet, not the pending/runtime regression, physical native input, audio listening, three physical PCs, FPS, all browsers, deployment or main merge; numerical runtime authority remains #41/PR #42. No shipped raster was added by #30: review PNGs are QA evidence, and existing asset/font provenance remains in its manifests.
