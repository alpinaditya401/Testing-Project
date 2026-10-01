"""Loopback-only simulator. No serial port, GPIO, or physical hardware control."""
import argparse
import json
import os
import re
import time
import urllib.request
from urllib.parse import urlsplit


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url',required=True)
    parser.add_argument('--device-id',required=True)
    parser.add_argument('--outcome',choices=('succeeded','failed','timeout'),default='succeeded')
    parser.add_argument('--once',action='store_true',required=True,help='Consume one batch only; run again to poll a later batch')
    args=parser.parse_args()
    url=urlsplit(args.base_url)
    if url.scheme!='http' or url.hostname not in ('127.0.0.1','localhost','::1') or url.path not in ('','/') or url.username or url.password or url.query or url.fragment:
        parser.error('Only an explicit loopback HTTP test server is allowed')
    if not re.fullmatch(r'[A-Za-z0-9_-]+',args.device_id):parser.error('Invalid device ID')
    key=os.environ.get('AQUASMART_DEVICE_KEY')
    if not key:parser.error('AQUASMART_DEVICE_KEY must be configured in environment')
    base=args.base_url.rstrip('/')+'/api/simulator/devices/'+args.device_id+'/commands'
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,*a,**kw):return None
    client=urllib.request.build_opener(urllib.request.ProxyHandler({}),NoRedirect())
    def request(path='',data=None):
        req=urllib.request.Request(base+path,data=None if data is None else json.dumps(data).encode(),headers={'X-Device-Key':key,'Content-Type':'application/json','Accept':'application/json'})
        with client.open(req,timeout=5) as response:return json.load(response)
    payload=request()
    if not isinstance(payload,dict):raise RuntimeError('Invalid command response')
    commands=payload.get('commands')
    if not isinstance(commands,list):raise RuntimeError('Invalid commands array')
    for cmd in commands:
        if not isinstance(cmd,dict):raise RuntimeError('Invalid command object')
        if cmd.get('simulation') is not True:raise RuntimeError('Refusing non-simulation command')
        identifier=cmd.get('id')
        if not isinstance(identifier,str) or not re.fullmatch(r'[0-9a-f]{32}',identifier):raise RuntimeError('Invalid command ID')
        if cmd.get('actuator') not in ('feeder','aerator','auto'):raise RuntimeError('Unknown actuator')
        if type(cmd.get('value')) is not bool:raise RuntimeError('Invalid command value')
        duration=cmd.get('duration')
        if type(duration) is not int or (not 1<=duration<=30 if cmd['actuator']=='feeder' else duration!=0):raise RuntimeError('Unsafe duration')
    count=0
    for cmd in commands:
        if args.outcome=='timeout':continue
        if cmd['actuator']=='feeder':time.sleep(cmd['duration'])
        request('/'+cmd['id']+'/ack',{'status':args.outcome})
        count+=1
    print(json.dumps({'simulation':True,'acknowledged':count,'outcome':args.outcome,
                      'waiting_for_expiry':args.outcome=='timeout' and bool(commands),'physical_hardware':False}))

if __name__=='__main__':main()
