# 阁楼小屋与桌边动作

Mode: Experience. Scope: the indoor Godot room and its table interaction; existing native navigation stays intact. This records the implemented local trial as of 2026-10-30, not a replacement for the app-wide product or design system.

User brief (2026-10-30): implement sitting on a chair and leaning on a table, using the first supplied Travel Frog screenshot as the room direction.

Implemented direction: two-storey illustrated woodland cottage, blue loft bed, central round window, right wooden staircase, green cabinet beneath, stove and door below, round wooden table on a moss rug. Warm timber and muted greens frame the project's calico. Background, chair, table and cat render independently. Original scene art was generated from the reference layout; no screenshot UI or frog character is included.

Interaction: the cat approaches beside the chair, moves into the seat, then cycles through four authored poses: sitting, blinking, lowering its head and resting on its paws. Variable pose durations and brief movement/crossfade transitions provide the motion. On departure it steps down before walking. In the app, tapping the table uses the existing server-backed reading invitation; arrival confirmation precedes seating. Reduced motion skips movement transitions. Travel absence and activity cancellation clear transitions; the other life destinations remain available.

Visual invariants: visible seated weight on the cushion, paws above the tabletop while the lower body remains occluded, and a recognizable change from sitting to head-on-paws. Furniture stays still during pose changes. Preserve these contacts and the continuous step-down when changing assets or anchors. The upper loft and staircase are painted scenery; all pet navigation remains on the lower floor.

Assets: `assets/godot/loft/room-v1.png`, `cat-table-v1.png`, `furniture-v1.png`. Built-in imagegen produced the original PNGs, with no pixel edits. Exact prompts are in `assets/prompts/loft-*.txt` and PNG metadata; provenance is registered in `assets/manifest.json` and `assets/godot/manifest.json`. Runtime atlas regions and anchors separate the furniture, body and foreground paws.

Review disposition: **ship for the first local trial**. The [full review](../review/loft/review.md) accepted the four pose contacts, occlusion, proportions and layout, and identified one exit crossfade snapback (F1). The [targeted verdict](../review/loft/verdict.md) confirms F1 is resolved; it closes that finding rather than claiming a second whole-surface audit.

Evidence: actual desktop Godot 4.5.1 viewport captures in `.impeccable/review/loft/`, at 390×844 and 430×932. `table-demo.mp4` contains 178 captured frames at 10 fps, 390×844. The sampled handoff establishes placement continuity, not full-frame-rate smoothness. This native game scene has no applicable HTML/CSS detector. These captures are not simulator or physical-device evidence, and no phone installation was performed this turn.

Validation: scaffold check, mobile typecheck, 24 targeted mobile Engine/App tests, Godot `rn_bridge`, `cat_life` and `loft_table` suites, final `mobile:prepare-game` after F1, and iOS/Android JS bundle generation passed. Current local game packs match the final source. See [trial instructions and validation boundaries](../../docs/loft-table-20261030.md).

Known scope: a fixed calico/table/chair set with four authored key poses. Courtyard artwork and its existing reading action stay as before. General pet/furniture adaptation, a traversable upper floor and skeletal or fully drawn entry/exit animation are outside this slice. Run `npm run loft:preview` for the three-button desktop trial.
