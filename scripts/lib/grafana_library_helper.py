#!/usr/bin/env python3
"""Small helpers for scripts/provision-library-panels.sh -- kept as a real
file (not inline `python3 -c`) so arguments pass through argv/stdin instead
of being interpolated into Python source as shell strings.

Usage:
  grafana_library_helper.py folder-uid <title> < folders.json
  grafana_library_helper.py spec-uid <path/to/spec.json>
  grafana_library_helper.py spec-name <path/to/spec.json>
  grafana_library_helper.py element-exists < get-response.json
  grafana_library_helper.py build-payload <path/to/spec.json> <folder_uid> [version]
  grafana_library_helper.py list-elements < list-response.json
"""
import json
import sys


def main():
    cmd = sys.argv[1]

    if cmd == 'folder-uid':
        title = sys.argv[2]
        folders = json.load(sys.stdin)
        match = [f['uid'] for f in folders if f['title'] == title]
        print(match[0] if match else '')

    elif cmd == 'spec-uid':
        spec = json.load(open(sys.argv[2], encoding='utf-8'))
        print(spec['uid'])

    elif cmd == 'spec-name':
        spec = json.load(open(sys.argv[2], encoding='utf-8'))
        print(spec['name'])

    elif cmd == 'element-exists':
        try:
            d = json.load(sys.stdin)
            print('yes' if 'result' in d and d['result'].get('uid') else 'no')
        except Exception:
            print('no')

    elif cmd == 'element-version':
        d = json.load(sys.stdin)
        print(d['result']['version'])

    elif cmd == 'build-payload':
        spec = json.load(open(sys.argv[2], encoding='utf-8'))
        spec['folderUid'] = sys.argv[3]
        if len(sys.argv) > 4:
            spec['version'] = int(sys.argv[4])
        json.dump(spec, sys.stdout)

    elif cmd == 'list-elements':
        d = json.load(sys.stdin)
        for e in d['result']['elements']:
            print(f"  - {e['name']} ({e['uid']}) v{e['version']}")

    else:
        print(f'unknown command: {cmd}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
