# Loft room finish review

## 1. Disposition

**fix** — the room and requested static poses meet the first-trial brief, but the exit-to-walk handoff visibly jumps back to the seated location. Fix that one transition before handing over the trial. This is a full review of the regenerated evidence, replacing the earlier recapture result.

## 2. Material findings

### F1 — The cat snaps back onto the chair during the exit-to-walk crossfade

**Evidence:** `motion-0137.png` and `motion-0138.png` show the seated sprite moving down/right from the chair. The immediately following `motion-0139.png` shows the complete cat back at its original seated location. `motion-0140.png` then shows the floor-walking cat. The furniture remains fixed. This is a discontinuity in the promised step-down, visible in the supplied 10 fps sequence, rather than a request for higher animation fidelity.

**Source explanation:** `apps/godot/scripts/pet.gd`, `_leave_seat()` and `_cancel_seat_transition()`, reset `sprite.position` before `_play_pose()` snapshots the outgoing pose. `_play_pose()` copies the texture, scale and offset to `pose_ghost` but does not retain the translated sprite position. The outgoing ghost therefore reappears at the seat for the 0.08-second crossfade.

**Minimum fix:** retain the outgoing pose's full local placement when beginning the crossfade, while placing the incoming walking sprite at the ground anchor. Avoid resetting the visible outgoing pose to its seated location before the handoff. Recheck entry as well, since it shares this placement logic. No new character art or full animation rebuild is required.

**Acceptance:** consecutive frames through the exit must show descent followed by walking, without any return to the seated location. Keep the same table/chair placement and the already-working final sit/lean contacts. Recapture the same five required viewports and the short handoff sequence for a verdict pass limited to F1.

## 3. Brief coverage

| Requirement | Evidence and assessment |
| --- | --- |
| Chair sitting | `phone-sit.png`: hindquarters and rear feet meet the cushion/chair area; paws rest on the table; the seat supports the pose. |
| Head-and-paws leaning | `phone-lean.png`: closed eyes, lowered head and forward paws produce an immediately distinct resting posture. |
| Intermediate authored poses | `phone-blink.png` and `phone-lowering.png`: both are legible; the paws remain above the tabletop and no rectangular foreground cutout boundary or severed limb is visible. |
| Table/body occlusion | All four authored pose captures keep the lower torso behind the table edge while preserving the head and paws. No static-pose clipping requiring a fix was found. |
| Reference layout | Blue loft bed, round upper window, right staircase, green cabinet, lower door/stove, and round table on a moss rug reproduce the requested spatial arrangement. Original calico art and the existing game identity remain; reference-game UI is absent. |
| Scale and furniture stability | Cat, chair and table have coherent proportions across the four seated poses. Furniture does not move between poses. The two portrait sizes retain the bed, stairs, table and pet. The floor walker changes silhouette substantially, so transition continuity matters; F1 is the material failure found in that handoff. |
| Approach / departure | Sampled `motion-0020.png`, `0027.png`, `0030.png`, `0033.png`, `0036.png` and `0040.png` show the approach and entry. Updated `phone-exit.png` now shows descent, and `phone-away.png` shows an opaque cat back on the lower floor. The intervening snapback is F1. |
| Travel and reduced motion | Source/test code includes availability cancellation and reduced-motion checks. No new executed-test result or actual trip-absent screenshot was independently verified in this review. `phone-away.png` means away from the chair, not away on a trip. |

## 4. Evidence limitations

- Opened all five required captures at 390×844 / 430×932, plus blink/lowering captures and selected motion frames, including every frame from `motion-0134.png` through `motion-0145.png` around the handoff. All regenerated static captures are valid and settled as named.
- These are actual desktop Godot 4.5.1 viewport renders at phone sizes. They are not iPhone/Android device captures, native simulator captures, or proof of physical-device performance, touch behavior, safe-area handling, or RN integration.
- The 10 fps source frames establish visible placement changes but do not establish smooth playback at the game's runtime frame rate. The encoded recording was not reviewed. Four authored poses are sufficient for this first trial; an expectation of continuous skeletal motion would exceed its stated scope.
- No HTML/CSS detector ran or applies. Native navigation is outside this Godot scene slice, so platform navigation and typography rules were not used to invent unrelated work.
- The user's screenshot is the layout reference; there is no separate approved comp and no pixel-perfect reproduction claim. The upper loft/stairs remain painted scenery.

## 5. Quality assessment

The first viewport communicates the woodland cottage clearly. Warm timber, muted green furnishings and the blue loft bed form a coherent illustrated world, and the table activity remains easy to find on both portrait sizes. The four table poses preserve readable contact and enough expression to distinguish sitting from resting the head on the paws.

The limited key-pose animation and lack of device evidence are acceptable disclosed boundaries for this first local trial. F1 is material because it visibly reverses the departure just as the pet leaves the chair; correcting that handoff is a bounded implementation fix. No other mandatory visual correction was identified in this review's evidence and scope.
