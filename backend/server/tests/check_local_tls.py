"""Read-only TLS checks against a running Caddy; no insecure fallback."""
import argparse
import json
from pathlib import Path
import socket
import ssl
from datetime import datetime, timedelta, timezone
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--host',required=True)
args=parser.parse_args()
runtime=Path.home()/'.aquasmart/tls-local'
ca=runtime/'data/pki/authorities/local/root.crt'
output=Path(__file__).resolve().parents[2]/'test-output/local-tls-software'
output.mkdir(parents=True,exist_ok=True)
def connect(context, hostname):
    with socket.create_connection((args.host,8443),timeout=5) as sock:
        with context.wrap_socket(sock,server_hostname=hostname) as tls:
            certificate=tls.getpeercert()
            tls.sendall(f'GET /api/health HTTP/1.1\r\nHost: {args.host}:8443\r\nConnection: close\r\n\r\n'.encode())
            data=b''
            while True:
                block=tls.recv(4096)
                if not block: break
                data+=block
            return {'protocol':tls.version(),'certificate':certificate,'http_200':b'200 OK' in data.split(b'\r\n',1)[0],
                    'health_service':b'aquasmart-api' in data}
def context(cert):
    result=ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    result.load_verify_locations(cadata=cert)
    return result
certificate=ca.read_text()
report={'host':args.host,'port':8443,'ca_path':str(ca),'checked_at':datetime.now(timezone.utc).isoformat()}
report['positive']=connect(context(certificate),args.host)
try:
    connect(context(certificate),'incorrect.aquasmart.invalid')
    report['wrong_hostname_rejected']=False
except ssl.SSLError as error:
    report.update(wrong_hostname_rejected=True,wrong_hostname_error=str(error))
key=ec.generate_private_key(ec.SECP256R1())
name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'Unrelated test CA')])
wrong=(x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
       .serial_number(x509.random_serial_number()).not_valid_before(datetime.now(timezone.utc)-timedelta(minutes=1))
       .not_valid_after(datetime.now(timezone.utc)+timedelta(days=1)).add_extension(x509.BasicConstraints(ca=True,path_length=None),critical=True)
       .sign(key,hashes.SHA256()).public_bytes(serialization.Encoding.PEM).decode())
try:
    connect(context(wrong),args.host)
    report['wrong_ca_rejected']=False
except ssl.SSLError as error:
    report.update(wrong_ca_rejected=True,wrong_ca_error=str(error))
report['passed']=report['positive']['http_200'] and report['positive']['health_service'] and report['wrong_ca_rejected'] and report['wrong_hostname_rejected']
(output/'tls.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps(report,indent=2))
raise SystemExit(0 if report['passed'] else 1)
