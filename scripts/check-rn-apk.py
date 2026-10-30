"""Verify the built APK contains every exported Godot resource, including .godot."""
import argparse
import hashlib
from pathlib import Path
from zipfile import ZipFile


def digest(stream):
    result = hashlib.sha256()
    for block in iter(lambda: stream.read(1024 * 1024), b""):
        result.update(block)
    return result.digest()


parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("apk", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
source = root / "apps/mobile/android/app/src/main/assets/main"
files = sorted(path for path in source.rglob("*") if path.is_file())
if not files or not (source / ".godot").is_dir():
    raise SystemExit("Exported Godot resources are missing; run mobile:prepare-game first")
with ZipFile(args.apk) as archive:
    entries = set(archive.namelist())
    for path in files:
        name = "assets/main/" + path.relative_to(source).as_posix()
        if name not in entries:
            raise SystemExit(f"APK is missing {name}")
        with path.open("rb") as original, archive.open(name) as packaged:
            if digest(original) != digest(packaged):
                raise SystemExit(f"APK has stale or corrupted resource: {name}")
print(f"APK verified: {len(files)} Godot resources match the exported source")
