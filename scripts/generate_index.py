#!/usr/bin/env python3
import os, json, hashlib, time
from pathlib import Path
from datetime import datetime

def sha256_file(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(8192), b''):
            h.update(chunk)
    return h.hexdigest()

def scan_dir(path, base_path, depth=0):
    """Сканирует директорию и возвращает структуру для index.json"""
    result = {}
    
    for item in sorted(Path(path).iterdir()):
        if item.name.startswith('.'): continue
        if item.name in ['index.json', '404.html', 'generate_index.py']: continue
        
        name = item.name
        stat = item.stat()
        rel_path = item.relative_to(base_path)
        
        # Определяем иконку
        icon = 'file'
        if item.is_dir(): icon = 'folder'
        elif name.endswith('.apk'): icon = 'package'
        elif name.endswith(('.gz','.zip','.tar')): icon = 'archive'
        elif name.endswith(('.png','.jpg','.svg')): icon = 'image'
        elif name.endswith('.pub'): icon = 'key'
        
        entry = {
            "__INFO__": {
                "icon": icon,
                "type": "dir" if item.is_dir() else "file",
                "size": stat.st_size,
                "date": int(stat.st_mtime)
            }
        }
        
        if item.is_file():
            entry["sha256sum"] = sha256_file(item)
            # Авто-определение latest release
            if 'openwrt' in name.lower() and name.endswith('.img.gz'):
                entry["__INFO__"]["isLatest"] = True  # можно улучшить логику
        else:
            # Рекурсивное сканирование папок
            entry.update(scan_dir(item, base_path, depth+1))
        
        result[name] = entry
    
    return result

def main():
    base = Path('.')
    
    # Поиск последнего релиза
    releases = base / 'releases'
    latest = None
    if releases.exists():
        versions = [d for d in releases.iterdir() if d.is_dir()]
        if versions:
            latest = max(versions, key=lambda d: d.stat().st_mtime)
            latest_name = latest.name
    
    data = {
        "cfg": {
            "title": "Extra Packages for OpenWrt",
            "favicon": "/favicon.ico",
            "mainPage": {
                "latestRelease": f"releases/{latest_name}" if latest else None,
                "showChangelog": True,
                "changelogFile": "changelog.md",
                "quickLinks": [
                    {"label": "📦 Все релизы", "path": "releases/"},
                    {"label": "🔑 Ключ репозитория", "path": "key-build.pub", "download": True}
                ]
            },
            "folders": {}
        },
        "files": scan_dir(base, base)
    }
    
    # Авто-добавление cfg для папок с header.md/footer.md
    for md_file in base.rglob('header.md'):
        rel = str(md_file.relative_to(base).parent)
        if rel not in data["cfg"]["folders"]:
            data["cfg"]["folders"][rel] = {}
        data["cfg"]["folders"][rel]["header"] = str(md_file.relative_to(base))
    
    for md_file in base.rglob('footer.md'):
        rel = str(md_file.relative_to(base).parent)
        if rel not in data["cfg"]["folders"]:
            data["cfg"]["folders"][rel] = {}
        data["cfg"]["folders"][rel]["footer"] = str(md_file.relative_to(base))
    
    with open('index.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Generated index.json with {len(data['files'])} root entries")

if __name__ == '__main__':
    main()