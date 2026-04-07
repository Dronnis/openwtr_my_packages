# generate_index.py
import os, json, hashlib, time
from pathlib import Path

def scan_dir(path, base_path):
    result = {}
    for item in Path(path).iterdir():
        name = item.name
        stat = item.stat()
        entry = {
            "__INFO__": {
                "icon": "folder" if item.is_dir() else "file",
                "type": "dir" if item.is_dir() else "file",
                "size": stat.st_size,
                "date": int(stat.st_mtime)
            }
        }
        if item.is_file():
            with open(item, 'rb') as f:
                entry["sha256sum"] = hashlib.sha256(f.read()).hexdigest()
        elif item.is_dir():
            entry.update(scan_dir(item, base_path))
        result[name] = entry
    return result

data = {
    "cfg": {
        "title": "Extra Packages for OpenWrt",
        "favicon": "/favicon.ico",
        "readme": {
            "ru": "Репозиторий с дополнительными пакетами для OpenWrt...",
            "en": "Extra packages repository for OpenWrt..."
        }
    },
    "files": scan_dir(".", ".")
}

with open("index.json", "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)