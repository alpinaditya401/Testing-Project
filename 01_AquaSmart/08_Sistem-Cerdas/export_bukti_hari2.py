"""Export notebook 03 to HTML and screenshot the Soal 2 and Soal 3 outputs used by the Hari 2 report."""
from pathlib import Path
import subprocess
import sys

import nbformat
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
NB = ROOT / 'notebooks/03_evaluasi_perbandingan.ipynb'
OUT = HERE / 'tugas_mandiri_hari2/bukti'
OUT.mkdir(parents=True, exist_ok=True)

# Image name and a text fragment that identifies the code cell whose output is captured.
TARGETS = [
    ('s2_1', "aq = pd.read_csv(HARI1 / 'fitur_dan_target.csv'"),
    ('s2_2', 'rf_hari1 = buat_pipe_aq('),
    ('s2_3', 'hasil_cv = {nama: evaluasi_cv(model)'),
    ('s2_4', 'grid_aq = GridSearchCV('),
    ('s2_5', 'tabel_perbandingan = tabel_cv(hasil_cv)'),
    ('s3_1', 'peluang_cv = pd.Series(np.nan'),
    ('s3_2', 'AquaSmart: Underfitting vs Overfitting'),
    ('s3_3', 'model_final_aq = grid_aq.best_estimator_'),
    ('s3_4', "salah = uji[uji['asli'] != uji['tebakan']]"),
    ('s3_5', 'def ringkas_periode(X, y):'),
]
CSS = """
.jp-OutputArea-output pre { overflow: visible !important; white-space: pre !important; }
.jp-OutputPrompt, .jp-InputPrompt { display: none !important; }
.jp-OutputArea-output { overflow: visible !important; }
body { background: #ffffff !important; }
"""


def trim(path, pad=12):
    img = Image.open(path).convert('RGB')
    box = ImageChops.difference(img, Image.new('RGB', img.size, (255, 255, 255))).getbbox()
    if box:
        left, top, right, bottom = box
        img = img.crop((max(left - pad, 0), max(top - pad, 0),
                        min(right + pad, img.width), min(bottom + pad, img.height)))
    img.save(path)
    return img.size


subprocess.run([sys.executable, '-m', 'nbconvert', '--to', 'html', '--output-dir', str(OUT), str(NB)],
               check=True, capture_output=True)
nb = nbformat.read(NB, as_version=4)
code = [c.source if c.cell_type == 'code' else '' for c in nb.cells]

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1700, 'height': 1000}, device_scale_factor=2)
    page.goto((OUT / f'{NB.stem}.html').as_uri())
    page.add_style_tag(content=CSS)
    cells = page.locator('.jp-Cell')
    assert cells.count() == len(nb.cells), (cells.count(), len(nb.cells))
    for old in OUT.glob('s[23]_*.png'):
        old.unlink()
    for name, mark in TARGETS:
        hits = [i for i, source in enumerate(code) if mark in source]
        assert len(hits) == 1, (mark, hits)
        # Charts and printed text are captured apart so text keeps its natural size beside wide
        # charts; consecutive text outputs stay together to keep the notebook's line spacing.
        kids = cells.nth(hits[0]).locator('.jp-OutputArea-child').element_handles()
        boxes = page.evaluate("""(els) => els.map(e => { const r = e.getBoundingClientRect();
            return {x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height,
                    img: e.querySelector('img') !== null}; })""", kids)
        groups = []
        for b in boxes:
            if groups and not b['img'] and not groups[-1][-1]['img']:
                groups[-1].append(b)
            else:
                groups.append([b])
        for k, group in enumerate(groups):
            kind = 'img' if group[0]['img'] else 'txt'
            x0, y0 = min(b['x'] for b in group), min(b['y'] for b in group)
            x1, y1 = max(b['x'] + b['w'] for b in group), max(b['y'] + b['h'] for b in group)
            path = OUT / f'{name}_p{k}_{kind}.png'
            page.screenshot(path=str(path), clip={'x': x0, 'y': y0, 'width': x1 - x0, 'height': y1 - y0},
                            full_page=True)
            print(path.name, trim(path))
    browser.close()
