"""Composite Seedance's curtain motion over the original room and encode a loop.

Requires Pillow and NumPy. Pass a local FFmpeg executable with libtheora/libx264.
The output remains a full-frame video; only model drift outside the window is removed.
"""
import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets/video/morning-curtain-v1"
TARGET = ROOT / "assets/godot/morning/room-curtain.ogv"
WIDTH, HEIGHT, FPS, COUNT = 652, 1410, 24, 120


def smooth(value):
    value = np.clip(value, 0, 1)
    return value * value * (3 - 2 * value)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ffmpeg", required=True)
    args = parser.parse_args()
    original = ROOT / "assets/godot/morning/room.png"
    source = OUT / "source.mp4"
    base = np.asarray(Image.open(original).convert("RGB").resize((WIDTH, HEIGHT), Image.Resampling.LANCZOS))
    # Coordinates are in the original 853x1844 artwork; feather outside the full curtain sweep.
    y, x = np.mgrid[:HEIGHT, :WIDTH]
    x, y = x * 853 / WIDTH, y * 1844 / HEIGHT
    mask = (smooth((x - 60) / 30) * smooth((460 - x) / 40)
            * smooth((y - 290) / 30) * smooth((740 - y) / 30))[..., None]
    decoder = subprocess.Popen([args.ffmpeg, "-v", "error", "-i", str(source), "-vf", f"scale={WIDTH}:{HEIGHT}",
                                "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], stdout=subprocess.PIPE)
    encoder = subprocess.Popen([args.ffmpeg, "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24",
                                "-s", f"{WIDTH}x{HEIGHT}", "-r", str(FPS), "-i", "pipe:0",
                                "-an", "-c:v", "libtheora", "-q:v", "8", "-g", "24", "-pix_fmt", "yuv420p", str(TARGET),
                                "-an", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                                str(OUT / "room-curtain-preview.mp4")], stdin=subprocess.PIPE)
    frames = 0
    first = last = None
    try:
        while True:
            data = decoder.stdout.read(WIDTH * HEIGHT * 3)
            if not data:
                break
            assert len(data) == WIDTH * HEIGHT * 3, "Truncated decoded video frame"
            if frames < COUNT:
                frame = np.frombuffer(data, np.uint8).reshape(HEIGHT, WIDTH, 3)
                strength = float(smooth(min(frames, COUNT - 1 - frames) / 8))
                combined = np.rint(base * (1 - mask * strength) + frame * mask * strength).astype(np.uint8)
                assert np.array_equal(combined[mask[:, :, 0] == 0], base[mask[:, :, 0] == 0]), "Static scene drift"
                encoder.stdin.write(combined.tobytes())
                if frames == 0:
                    first = combined
                last = combined
            frames += 1
    finally:
        decoder.stdout.close()
        encoder.stdin.close()
        decode_status, encode_status = decoder.wait(), encoder.wait()
    assert decode_status == encode_status == 0, "FFmpeg failed"
    assert frames >= COUNT, "Generated clip is shorter than the intended loop"
    assert np.array_equal(first, last), "Loop endpoints differ before encoding"
    report = {"source": "source.mp4", "source_frames": frames, "output_frames": COUNT, "fps": FPS,
              "size": [WIDTH, HEIGHT], "duration_seconds": COUNT / FPS,
              "method": "Seedance window motion feathered into original still; 8-frame smooth endpoint blend; no synthetic motion",
              "mask_original_coordinates": {"outer": [60, 290, 460, 740], "feather": [30, 30, 40, 30]},
              "static_region_identical_before_encoding": True, "loop_endpoints_identical_before_encoding": True,
              "encoder": "libtheora q=8, yuv420p, GOP=24, no audio",
              "original_sha256": hashlib.sha256(original.read_bytes()).hexdigest(),
              "source_sha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "runtime_sha256": hashlib.sha256(TARGET.read_bytes()).hexdigest(), "runtime_bytes": TARGET.stat().st_size}
    (OUT / "processing.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
