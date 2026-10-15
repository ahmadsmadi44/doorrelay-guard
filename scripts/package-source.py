"""Create a source-only release archive; never package credentials or local state."""
from pathlib import Path
import os
import hashlib
import zipfile

root = Path(__file__).resolve().parent.parent
destination = root / "artifacts" / "DoorRelay-Guard-v0.2.0.zip"
destination.parent.mkdir(exist_ok=True)
excluded = {"node_modules", "dist", ".doorrelay", "artifacts", ".git", "__pycache__"}
files = []
for folder, directories, filenames in os.walk(root):
    directories[:] = [name for name in directories if name not in excluded]
    for name in filenames:
        if name.startswith(".env") and name != ".env.example":
            continue
        if name.endswith(".log"):
            continue
        files.append(Path(folder) / name)
with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, Path("doorrelay-guard") / path.relative_to(root))
with zipfile.ZipFile(destination) as archive:
    assert archive.testzip() is None
    assert "doorrelay-guard/public/samples/generated-parcel-test.mp4" in archive.namelist()
digest = hashlib.sha256(destination.read_bytes()).hexdigest()
(destination.parent / "SHA256SUMS.txt").write_text(f"{digest}  {destination.name}\n")
print(f"Validated release: {len(files)} files, {destination.stat().st_size:,} bytes")
