"""Compatibility entry point for the isolated report suite.

No fixed port, active server attachment, import-time process, or embedded key.
"""
from pathlib import Path
import subprocess
import sys


def main():
    script = Path(__file__).with_name('test_reports.py')
    return subprocess.run([sys.executable, '-B', str(script)], cwd=script.parents[2]).returncode


if __name__ == '__main__':
    sys.exit(main())
