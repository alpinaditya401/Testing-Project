"""Compatibility entry point for the maintained isolated AquaSmart browser audit.

Historical versions attached to fixed ports and had syntax errors. Their source
is retained in _backup-sebelum-revisi/20260915-legacy-audits.
"""
from pathlib import Path
import argparse
import runpy

if __name__ == '__main__':
    argparse.ArgumentParser(description=__doc__).parse_args()
    runpy.run_path(str(Path(__file__).with_name('verify_frontend_fixes.py')), run_name='__main__')
