"""Run isolated frontend regressions; preserve each real exit status."""
from pathlib import Path
import subprocess,json,sys
from datetime import datetime
app=Path(__file__).resolve().parents[2]
out=app/'test-output'/('frontend-fixes-regression-'+datetime.now().strftime('%Y%m%d-%H%M%S'))
out.mkdir(parents=True,exist_ok=False)
names=['skip_link','drawer_keyboard','settings_labels','http_error_boundary','routes','offline','operations','demo','threshold','data','refresh','settings','feeder','growth','workspace','sw','calendar_reports','calendar_states','completion','device_lifecycle','pwa','export','provenance']
names.append('demo_devices')
names.append('product_mockups')
names.append('product_live')
summary=[]
for name in names:
 script=app/f'web/tests/review_{name}.mjs';label=out.name+'/'+name
 try:
  r=subprocess.run(['node',str(script),label],cwd=app,capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=100)
  text=r.stdout+r.stderr;code=r.returncode
 except subprocess.TimeoutExpired as exc:
  text='TIMEOUT: suite did not complete';code=124
 (out/(name+'.log')).write_text(text,encoding='utf-8')
 result_file=out/name/'results.json'
 result=json.loads(result_file.read_text(encoding='utf-8')) if result_file.exists() else None
 row={'suite':name,'exit_code':code,'assertions':len(result['results']) if result else None,'failed':[x for x in result['results'] if not x['pass']] if result else [],'errors':result['errors'] if result else []}
 if result and (row['failed'] or row['errors']) and code==0:row['exit_code']=1
 summary.append(row)
 (out/'summary.json').write_text(json.dumps(summary,indent=2),encoding='utf-8')
 print(json.dumps(row,ensure_ascii=True),flush=True)
print('ARTIFACTS',out.as_posix(),flush=True)
sys.exit(1 if any(x['exit_code'] for x in summary) else 0)
