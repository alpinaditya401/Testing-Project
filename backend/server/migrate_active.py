"""Windows maintenance migration: backup, no bootstrap, preserve every original value."""
import json
import os
from pathlib import Path
import sqlite3
import subprocess
from contextlib import closing
from datetime import datetime
from backup_local import backup

app=Path(__file__).resolve().parents[1]
database=app/'server/data/aquasmart.sqlite'
folder=app/'_backup-sebelum-revisi'/datetime.now().strftime('%Y%m%d-%H%M%S-active-migration')
check=subprocess.run(['powershell','-NoProfile','-Command',
    "@(Get-Process php -ErrorAction SilentlyContinue).Count"],capture_output=True,text=True,check=True)
if check.stdout.strip()!='0':
    raise SystemExit('Stop PHP processes first. No database changes performed.')
folder.mkdir(parents=True)
snapshot=backup(database,folder/'before.sqlite')
report={'backup':str(snapshot),'tables':{},'restored':False}
with closing(sqlite3.connect(database)) as db:
    original={}
    for (table,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"):
        columns=[r[1] for r in db.execute(f'PRAGMA table_info("{table}")')]
        original[table]=(columns,db.execute(f'SELECT * FROM "{table}" ORDER BY rowid').fetchall())
try:
    env={**os.environ,'AQUASMART_DB_PATH':str(database),'AQUASMART_APP_ENV':'development'}
    result=subprocess.run(['php','-r',"require 'server/src/Database.php'; Database::connection(false);"],
                          cwd=app,env=env,capture_output=True,text=True,timeout=30)
    if result.returncode: raise RuntimeError('Migration failed: '+result.stderr)
    with closing(sqlite3.connect(database)) as db:
        for table,(columns,rows) in original.items():
            fields=','.join('"'+column+'"' for column in columns)
            after=db.execute(f'SELECT {fields} FROM "{table}" ORDER BY rowid').fetchall()
            report['tables'][table]={'before':len(rows),'after':len(after),'values_preserved':after==rows}
        report['quick_check']=db.execute('PRAGMA quick_check').fetchone()[0]
        report['source_defaults']={table:db.execute(f'SELECT provenance,COUNT(*) FROM {table} GROUP BY provenance').fetchall()
             for table in ('sensor_readings','alerts','actuator_commands','growth_observations','audit_logs')}
    if report['quick_check']!='ok' or not all(row['values_preserved'] for row in report['tables'].values()):
        raise RuntimeError('Data preservation check failed')
    report['passed']=True
except BaseException as error:
    with closing(sqlite3.connect(snapshot)) as source, closing(sqlite3.connect(database)) as target:
        source.backup(target)
        if target.execute('PRAGMA quick_check').fetchone()[0]!='ok': raise RuntimeError('Restore integrity failed')
    report.update(passed=False,restored=True,error=str(error))
finally:
    (folder/'result.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'passed':report['passed'],'restored':report['restored'],'report':str(folder/'result.json')}))
raise SystemExit(0 if report['passed'] else 1)
