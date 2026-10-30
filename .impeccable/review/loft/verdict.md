# Loft room targeted verdict

## Disposition

**ship** — F1 is **resolved** for the first local trial. This verdict closes the one material finding from `review.md`; it is not a new whole-surface audit.

## Finding score

| Finding | Score | Evidence |
| --- | --- | --- |
| F1: outgoing cat jumps back to the chair during exit-to-walk handoff | **resolved** | Final `motion-0136.png`–`motion-0139.png` continue down/right from the seat. `motion-0139.png` now keeps the cat at the descended position, where the old recording showed the seated snapback. `motion-0140.png`–`motion-0143.png` continue into the floor-walking pose without returning to the seat. `phone-exit.png`, `phone-handoff.png` and `phone-away.png` confirm descent, handoff and opaque settled floor placement. |

## Scope checked

Inspected the three named handoff captures, every final motion frame from 0136 through 0143, and entry frames 0034 through 0040 because entry shares the placement logic. The entry sample progresses into the seat and does not exhibit the repaired reverse jump. No new polish review was opened.

The source now saves `sprite.position` in `_set_state()` before canceling the seat tween, then passes it into `_play_pose()` and assigns it to `pose_ghost.position`. The leave callback no longer clears it first. The added acceptance assertion checks that the outgoing ghost retains `_seat_offset()` when walking starts. This review inspected that assertion but did not independently rerun the graphical test command.

## Evidence limits

These are Godot desktop viewport captures at phone dimensions. The sequence is sampled at 10 fps and establishes the correction's placement continuity; it does not establish full-frame-rate smoothness, native device integration, or physical-device performance. The static full-review findings and scope remain recorded in `review.md`.

## Quality assessment

The specific snapback is gone. The four authored table poses and brief crossfade remain an appropriate disclosed level of animation for the explicitly first local trial. No further work is owed against F1.
