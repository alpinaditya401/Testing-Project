"""Read-only source inventory and syntax review; never executes legacy scripts."""
from pathlib import Path
from datetime import datetime
import ast
import hashlib
import json
import subprocess

root=Path(__file__).resolve().parents[2]
out=root/'test-output'/('source-review-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
out.mkdir(parents=True)
ignored={'_backup-sebelum-revisi','node_modules','data','__pycache__','.pytest_cache','.git'}
extensions={'.php','.py','.js','.mjs','.ts','.tsx','.vue','.svelte','.html','.css','.md','.txt','.webmanifest','.svg'}
files=[]
for path in sorted(root.rglob('*')):
    if not path.is_file() or any(part in ignored for part in path.relative_to(root).parts) or path.suffix not in extensions:
        continue
    data=path.read_bytes(); content=data.decode('utf-8-sig')
    row=dict(path=path.relative_to(root).as_posix(),bytes=len(data),lines=len(content.splitlines()),sha256=hashlib.sha256(data).hexdigest())
    if path.suffix in {'.js','.mjs'}:
        result=subprocess.run(['node','--check',str(path)],capture_output=True,text=True)
        row['syntax_ok']=result.returncode==0
        if result.returncode:row['syntax_error']=result.stderr
    elif path.suffix=='.py':
        try:ast.parse(content);row['syntax_ok']=True
        except SyntaxError as error:row.update(syntax_ok=False,syntax_error=str(error))
    files.append(row)
report=dict(files=files,file_count=len(files),syntax_checked=sum('syntax_ok' in f for f in files),
            syntax_failed=[f for f in files if f.get('syntax_ok') is False],
            scope='Inventory and syntax checks do not establish runtime correctness. See REVIEW_REPORT.md for reviewed groups and limitations.')
(out/'inventory.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({key:value for key,value in report.items() if key!='files'},indent=2))
print('EVIDENCE',out.as_posix())
