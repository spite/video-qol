"""Package the extension for the Chrome Web Store: python3 build.py -> dist/video-qol-<version>.zip"""
import json
import re
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).parent
manifest = json.loads((ROOT / 'manifest.json').read_text())

files = {'manifest.json'}
files.add(manifest['background']['service_worker'])
for cs in manifest['content_scripts']:
    files.update(cs['js'])
files.update(manifest['icons'].values())
files.update(manifest['action']['default_icon'].values())

# The options page and whatever it loads.
page = manifest['options_ui']['page']
files.add(page)
files.update(re.findall(r'(?:src|href)="([^":#]+)"', (ROOT / page).read_text()))

missing = [f for f in sorted(files) if not (ROOT / f).is_file()]
if missing:
    raise SystemExit(f'missing files: {missing}')

out = ROOT / 'dist' / f"video-qol-{manifest['version']}.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in sorted(files):
        z.write(ROOT / f, f)

print(out)
for f in sorted(files):
    print('  ', f)
