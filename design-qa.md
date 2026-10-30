# 正式首页接入验收 · 2026-10-18

Scope: selected engawa home with the user-requested 24-frame sprite, native routes and local backend integration. This does not certify award-level design, pixel-identical character redraws or a finished redesign of the older walking rooms.

Source visual truth: design/2026-10-18-ui-study/01-engawa.png, 853×1844; animated character asset: assets/godot/engawa/cat-idle-24.png, 1536×1024, 24 frames.

Implementation screenshots: assets/review/engawa-integration/home.png, menu.png, away.png, bag.png, collection.png, small-home.png. Native Godot rendering, no browser chrome. Main comparison at390×844; source art is proportionally scaled without stretching. The24-frame character is a separately redrawn asset and is not subject to the obsolete pixel-error claim from the earlier shader version.

## Findings and fixes

- P1: selected home was previously isolated from production. Fixed by mounting EngawaHome in main.gd; bag, collection, courtyard, activity, trip and settings routes now work.
- P1: focused menu text became white on pale paper. Fixed theme focus/hover/pressed colors; rerendered menu.png and repeated pointer checks.
- P2: away status covered illustration with a flat rectangle. Fixed using an edited watercolor subtitle region plus native calligraphic text. Verified away.png; cat is absent.
- P2: small-screen menu target shrank below44 points. Fixed minimum logical hit area without resizing art. Small-screen assertion and screenshot passed.

## Fidelity surfaces

- Typography: source home lettering retained; native menu and content use readable dark text. Secondary headings use Songti with named fallbacks. Other platforms' fallback appearance is not yet verified.
- Spacing/layout: source home composition retained without old page chrome. Secondary content scrolls; fixed navigation remains visible. Original image and home screenshot reviewed at matching proportions.
- Colors: source home unretinted; native paper, green ink and warm terracotta controls. Menu focus now readable.
- Image quality: 24-frame transparent cat, no deformation shader. Checked full source sheet and in-engine rest/raised-tail poses. Original artwork textures are not reproduced pixel-for-pixel by generated animation. Reused bento/bottle and postcard images retain provenance.
- Copy/content: existing test-travel semantics and backend authority are preserved; no fake currency or reward data added. Away caption agrees with server state.

Focused regions inspected: cat and paws, menu focus text, away subtitle, bottom home entrances. Main screen and bag/collection inspected in full; small-home composition inspected separately.

## Interaction evidence

75 Godot regression checks passed. 34 real local-backend graphical acceptance checks passed, including authenticated storage, departure, arrival, claim, duplicate claim and relogin.16 viewport-pointer checks passed, including real UI event targeting of home entrances/menu/return, offline recovery visibility, server-state display and small-screen hit area. Native import/export logs contain no script/shader errors. macOS debug package built.

## Follow-up scope

The existing room scenery remains unchanged. Walking now uses24frames per direction; direction hysteresis, stride-phase continuity and actual-speed playback are retained. Offset-room navigation was corrected and passed17 graphical movement checks plus80 regressions. See design/2026-10-18-ui-study/walk24/README.md. Life actions now also use 24 frames: eat12fps, pet10fps and sleep8fps. Native playback/interaction passed14 checks; latest regression passed80 checks and viewport-pointer flow passed17 checks including outside-menu dismissal. See design/2026-10-18-ui-study/life24/README.md. iOS, notarization, publication and cross-platform type/accessibility verification remain outside this local integration acceptance. No claim that the full long-running design objective is complete.

No unresolved P0/P1/P2 issues in this home-integration gate after the above fixes.

final result: passed


Secondary-page follow-up: compact return header, readable muted/primary text, semantic bag selection and postcard presentation. 25 actual viewport-pointer checks passed at 390×844 and 320×568 logical sizes. See design/2026-10-18-ui-study/SECONDARY.md for contrast measurements and screenshots.
