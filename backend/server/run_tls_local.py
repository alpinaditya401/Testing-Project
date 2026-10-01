"""Run Caddy + PHP locally against the preserved database. Ctrl+C stops both."""
import argparse
import os
from pathlib import Path
import subprocess
import time

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host',required=True)
args=parser.parse_args()
import ipaddress
address=ipaddress.ip_address(args.host)
if address.version!=4 or not address.is_private or address.is_loopback:
    raise SystemExit('Use the private LAN IPv4 address of this computer')
app=Path(__file__).resolve().parents[1]
runtime=Path.home()/'.aquasmart/tls-local'
runtime.mkdir(parents=True,exist_ok=True)
caddy=runtime.parent/'caddy-2.11.4/caddy.exe'
if not caddy.is_file(): raise SystemExit('Install verified Caddy 2.11.4 first; see LOCAL_GUIDE')
database=app/'server/data/aquasmart.sqlite'
if not database.is_file(): raise SystemExit('Existing database required; do not bootstrap here')
config=runtime/'Caddyfile'
config.write_text('''{
 admin off
 skip_install_trust
 auto_https disable_redirects
 storage file_system {
  root "'''+(runtime/'data').as_posix()+'''"
 }
}
https://'''+args.host+''':8443 {
 tls internal
 reverse_proxy 127.0.0.1:8080
}
''',encoding='utf-8')
subprocess.run([str(caddy),'validate','--config',str(config),'--adapter','caddyfile'],check=True)
handoff=Path.home()/'.aquasmart/device-handoff'
handoff.mkdir(parents=True,exist_ok=True)
env={**os.environ,'AQUASMART_DEVICE_HANDOFF_DIR':str(handoff),'AQUASMART_DB_PATH':str(database),'AQUASMART_APP_ENV':'development',
     'AQUASMART_SESSION_SECURE':'1','AQUASMART_HARDWARE_ENABLED':'0','AQUASMART_SIMULATOR_ENABLED':'0'}
processes=[]
try:
    with (runtime/'php.log').open('a',encoding='utf-8') as phpLog, (runtime/'caddy.log').open('a',encoding='utf-8') as caddyLog:
        processes.append(subprocess.Popen(['php','-S','127.0.0.1:8080','-t','web','server/router.php'],cwd=app,env=env,stdout=phpLog,stderr=subprocess.STDOUT))
        processes.append(subprocess.Popen([str(caddy),'run','--config',str(config),'--adapter','caddyfile'],cwd=app,stdout=caddyLog,stderr=subprocess.STDOUT))
        print(f'HTTPS https://{args.host}:8443 ; logs {runtime}',flush=True)
        while all(p.poll() is None for p in processes): time.sleep(0.5)
        raise RuntimeError('Local service exited; inspect runtime logs')
except KeyboardInterrupt:
    pass
finally:
    for process in processes:
        if process.poll() is None: process.terminate()
        process.wait(timeout=10)
