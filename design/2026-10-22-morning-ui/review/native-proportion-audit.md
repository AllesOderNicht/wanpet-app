# Morning native asset and proportion audit

2026-10-22. Scope: approved morning artwork, room data and a derived pet pack. Native scene integration and visual acceptance are performed separately by the main implementation. No cat image was cropped, repainted, resampled, mirrored, stretched or regenerated in this work.

## Artwork and room coordinates

`assets/godot/morning/{room,courtyard,bundle}.png` are byte-for-byte copies of the approved prototype's same-named images. SHA-256, byte counts and source paths are in `assets/godot/morning/provenance.json`. Original image generation records remain in `design/2026-10-22-morning-ui/assets/provenance.json` and `generated-prompts.json`.

Both room plates are 853×1844. Both new room JSON files use a 390×844 logical scene with centered **cover** rendering, matching the prototype's `object-fit: cover`. At the reference viewport, the background scale is 844/1844 = 0.45770065, the drawn width is 390.41866, and x offset is −0.20933. Scaling x and y independently would subtly stretch the source; use one uniform scale.

The prototype's cat foot is at 52% width and 77% height: **(202.8, 649.88)**. This is the initial spawn in both rooms. Navigation is restricted to the foreground rug / clear stone paving. It deliberately excludes the desk, chair, coffee table, backpack, courtyard furniture, planting beds, foreground plants and chest. Objects and interactions arrays are empty because the furniture is already painted into the approved background and RN owns the door/bag/album controls. There is no invisible food bowl or unreachable doorway path target.

The footprints are conservative pet-foot regions, not the entire visible floor. They keep the whole visible cat away from viewport clipping. Across all rendered non-transition frames, **alpha > 0** extents from the unchanged source anchor are at most left 118.485, right 114.947, top 143.987 and bottom 6.689 logical pixels. The data contain no per-pose depth scaling; every pose remains in the same logical scene coordinate system.

## Why the prototype's fitter is not the native calibration

The prototype independently fit each clip's atlas rectangle into a 222.3×151.92 canvas. That was sufficient to preview the original sprites but does not establish shared physical dimensions: transparent margins, tail length, standing legs and different atlas pixel densities are unrelated.

The active native source has no `pixel_scale` or `display_scale` field. `HomePet._align_frame()` computes the effective multiplier as **`pack.scale * clip.scale`**, then positions the image using the original pixel anchor. The source `standing_scale` and `display_oversampling` fields are historical packing inputs; the renderer must not multiply them again. The old effective scale is 1/3 for standing/transition atlases and 1/4 for life-action atlases.

The new pack uses **one constant per source-density / pose family**, chosen after reviewing the original rest, side, front and transition reference frames. It does not resize by each frame's alpha box. The narrow frontal/back projection is retained; the side silhouette includes a long tail and extended paws. These projections must not be made the same width.

The visual check also used a repeatable mid-body cross-section, away from the outer tail and raised paw tips. In source frame 0, the contiguous alpha≥128 span is rest row 220: x281–937 (656 px), left row 120: x76–418 (342 px), right row 120: x91–439 (348 px), frontal chest row 150: x18–162 (144 px), and back row 150: x19–140 (121 px). At the chosen family scales these are **129.4, 147.1, 149.6, 84.0 and 70.6 logical pixels**. This supports comparable curled/side torso bulk while retaining front/back foreshortening. The rows are manually selected anatomical bands, not an automated reconstruction of identical physical anatomy. The source videos retain stylistic and viewpoint differences; exact head dimensions cannot be made identical without changing the art.

## Fixed calibration and measured output

The approved target is a resting cat approximately 190 pixels wide at 390×844. Side walking stays approximately 205 pixels wide; front/back standing height stays approximately 140 pixels. The numeric output below is measured from source **alpha≥128** over all 121 frames, after applying the fixed multipliers. These bounds are output checks, not the sizing algorithm. Full ranges and contact deltas are recorded in `assets/godot/morning/proportion-metrics.json`.

| Clip family | Effective source-pixel scale | Visible width median | Visible height median | Range relevant to composition |
| --- | ---: | ---: | ---: | --- |
| full engawa rest | 0.1973001038 | 190.00 | 96.87 | width 189.21–201.84, including tail motion |
| sleep / eat / pet | 0.5919003115 | 190.00 / 190.00 / 191.18 | 97.07 / 96.48 / 101.81 | max pet height 104.17 |
| walk left | 0.43 | 205.54 | 91.16 | width 204.68–206.83 |
| walk right | 0.43 | 205.54 | 97.61 | width 203.82–208.12 |
| walk front | 0.5833333333 | 93.33 | 138.83 | height 135.92–140.00 |
| walk back | 0.5833333333 | 74.67 | 140.58 | height 135.33–142.92 |
| lie down / rise, retained but bypassed | 0.5833333333 | 137.08 / 135.33 | 90.42 / 96.83 | endpoints cannot satisfy both approved rest and standing |

`pack.scale` remains 0.17; the per-clip `scale` values divide the effective values above by 0.17. All four standing idle clips use the same scale as their corresponding walking clip. Each walk clip's `ground_speed` is multiplied by the same ratio as its visual scale, preserving the existing movement-to-animation calculation. The source 24 fps, stride frames and every original frame rectangle/anchor are retained. The right source had no explicit ground speed, so its former runtime fallback (`pack.speed`, 48.36) is made explicit before applying the same ratio. Front/back ground speed remains a scene/perspective heuristic, not a claim of measured zero foot sliding.

## Rest and transition behavior required from the runtime

`morning-pet.json` adds these flags:

- `initial_state: "rest"`
- `transition_mode: "crossfade"`
- A dedicated `clips.rest` containing **all 121 engawa frames at 24 fps**, with their original seven texture paths, rectangles, durations and anchors. This is the full 5.0417-second source animation, replacing the prototype's bounded 18-frame preview.

Required hooks in the existing runtime:

1. Load `morning-pet.json` and the matching `morning-{interior,courtyard}.json` for the new scene; use the JSON scene size instead of the old hardcoded 390×560 viewport.
2. Apply background `cover` with a uniform scale and centered offset. Current `room.gd` independently divides x/y by texture dimensions and needs the cover branch for these plates.
3. Initialize from `initial_state`. When `state == "rest"`, prefer the dedicated `rest` clip; currently `_play_pose()` hardcodes `rest → sleep`.
4. Honor `transition_mode == "crossfade"` at rest/walk/life state boundaries, bypassing visible `rise` and `lie_down` playback for this pack. Keep the fixed calibrated scale on both endpoints and crossfade opacity only. Do not animate scale, fit a bounding box each frame, or drop any source frames from the preserved pack.
5. Respect per-frame `duration` when creating SpriteFrames. Current engawa values are all 1, so ordinary `add_frame()` is equivalent for this dataset; passing the value preserves the full source contract.

The existing `_align_frame()` multiplication and anchor formula already support the calibration. No new per-frame scaling hook is needed. Existing navigation radius and hit testing can continue using scene units; no texture dimensions should enter navigation calculations.

The original transition mismatch is measurable: `rise` starts with a 240×124 source-pixel curled silhouette and ends with a 183×242 standing silhouette. Matching its 240-pixel curled width to 190 requires a 0.791667 multiplier, making the final standing height **191.58**. At the chosen standing multiplier 0.583333, its curled endpoint is only **140×72.33**. One fixed transform cannot satisfy both. `lie_down` has a similar mismatch and its original contact point sits 5.65–9.15 logical pixels below its anchor at this calibration. Those shortcomings belong to the existing transition imagery; an opacity handoff avoids advertising a growing/shrinking cat while preserving all original resources.

## Original frame evidence

No new cat contact sheet was generated. These existing PNG atlases are the actual source-frame contact sheets, not illustrative redraws:

- [Rest atlas 0, frames 0–17](../../../apps/godot/assets/engawa/video-full/cat-video-00.png), with all seven original atlases referenced by the new pack.
- [Left, all 121 frames](../../../apps/godot/assets/pets/runtime-video/left-00.png) and [right, all 121 frames](../../../apps/godot/assets/pets/runtime-video/right-00.png).
- [Front, all 121 frames](../../../apps/godot/assets/pets/runtime-video/front-00.png) and [back, all 121 frames](../../../apps/godot/assets/pets/runtime-video/back-00.png).
- [Rise source first pose](../../../assets/video/cat-rise-v2/first-frame.png) and [last pose](../../../assets/video/cat-rise-v2/last-frame.png) show why endpoint proportions differ.

Existing source references can contain green RGB values under fully transparent pixels; renderer alpha blending must remain enabled. The morning assets do not introduce chroma-key processing.

## Verification and limits

Passed: approved plate byte equality and SHA-256; every referenced atlas exists; all original walking/life/transition frame arrays and FPS unchanged; complete 121-frame rest array equal to engawa source; atlas rectangles within true PNG dimensions; spawn inside each simple polygon; fixed-scale all-frame alpha metrics; non-transition silhouettes stay within the viewport for all footprint vertices. No file outside the assigned art/data/audit scope was modified.

Not run by this asset task: morning Godot scene, touch navigation, RN integration, full animated crossfades, device memory/performance, or user visual acceptance. The source videos have existing shape and foot-contact variation (back walking alpha contact varies approximately −3.23 to +4.94 logical pixels around its fixed anchor). Fixed scales preserve these variations rather than hiding them through per-frame rescaling. Final full-motion inspection remains required.
