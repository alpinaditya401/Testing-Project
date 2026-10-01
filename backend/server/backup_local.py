"""Consistent SQLite backup, including committed WAL data; never overwrite a file."""
import argparse
from contextlib import closing
from pathlib import Path
import sqlite3


def backup(database, output):
    database = Path(database).resolve(strict=True)
    output = Path(output).absolute()
    if output.exists():
        raise FileExistsError('Output already exists')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Reserve the output exclusively before SQLite opens it.
    with output.open('xb'):
        pass
    try:
        with closing(sqlite3.connect(database.as_uri() + '?mode=ro', uri=True)) as source:
            with closing(sqlite3.connect(output)) as target:
                source.backup(target)
                if target.execute('PRAGMA quick_check').fetchone()[0] != 'ok':
                    raise RuntimeError('Backup integrity check failed')
    except BaseException:
        output.unlink()
        raise
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--database', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(backup(args.database, args.output))
