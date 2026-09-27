"""Render saved notebook outputs to HTML for reproducible screenshots."""
from pathlib import Path
import html
import nbformat

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / '01_AquaSmart/08_Sistem-Cerdas/tugas_mandiri/bukti'
OUT.mkdir(exist_ok=True)
eda = nbformat.read(ROOT / 'notebooks/01_eda.ipynb', as_version=4)
baseline = nbformat.read(ROOT / 'notebooks/02_baseline.ipynb', as_version=4)


def render(cell):
    result = ''
    for output in cell.get('outputs', []):
        if output.output_type == 'stream':
            result += '<pre>' + html.escape(output.text) + '</pre>'
        elif output.output_type in ['execute_result', 'display_data']:
            data = output.data
            if 'text/html' in data:
                result += data['text/html']
            elif 'image/png' in data:
                result += '<img src="data:image/png;base64,' + data['image/png'] + '">'
            elif 'text/plain' in data:
                result += '<pre>' + html.escape(data['text/plain']) + '</pre>'
    return result


groups = {
    1: ('Project framing', eda, [2]),
    2: ('EDA dataset project', eda, [4, 6, 7]),
    3: ('Pembersihan dan feature engineering', eda, [9]),
    4: ('Perbandingan baseline', baseline, [2, 4, 5, 6]),
    5: ('Pemeriksaan data leakage', baseline, [8]),
}
style = '''body{font:17px Arial,sans-serif;color:#202020;margin:40px;max-width:1120px}
h1{font-size:27px}h2{font-size:20px;margin-top:30px}p{line-height:1.5}
pre{font:14px Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
table{border-collapse:collapse;font-size:14px;margin:20px 0;width:100%}
td,th{padding:8px;text-align:left!important;border-bottom:1px solid #ddd}
th{background:#f0f2f2}img{max-width:100%;height:auto}section{margin-bottom:28px}
.meta{color:#555;font-size:14px}'''
for number, (title, nb, indices) in groups.items():
    body = f'<h1>Soal {number} · {title}</h1><p>AquaSmart AIoT · Tugas Mandiri Hari 1</p>'
    body += '<p class="meta">Bukti output dari notebook yang telah dieksekusi, diekspor ke HTML tanpa mengubah nilai hasil.</p>'
    for index in indices:
        cell = nb.cells[index]
        assert cell.cell_type == 'code', (number, index)
        body += f'<section><h2>Output sel {cell.execution_count}</h2>{render(cell)}</section>'
    (OUT / f'soal_{number}.html').write_text(
        f'<!doctype html><html lang="id"><meta charset="utf-8"><title>Soal {number}</title><style>{style}</style><body>{body}</body></html>', encoding='utf-8')
print(OUT)
