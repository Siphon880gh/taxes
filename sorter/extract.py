#!/usr/bin/env python3
"""Extract a zip or tar under dest. Rejects paths that escape dest. Does not execute members."""
import json
import os
import sys
import tarfile
import zipfile


def safe_parts(name):
    name = name.replace("\\", "/")
    if name.startswith("/") or (len(name) > 1 and name[1] == ":"):
        raise ValueError("path traversal")
    parts = []
    for part in name.split("/"):
        if part in ("", "."):
            continue
        if part == "..":
            raise ValueError("path traversal")
        parts.append(part)
    return parts


def safe_target(dest, name):
    parts = safe_parts(name)
    if not parts:
        return None
    target = os.path.realpath(os.path.join(dest, *parts))
    dest_real = os.path.realpath(dest)
    if target != dest_real and not target.startswith(dest_real + os.sep):
        raise ValueError("path traversal")
    return target


def extract_zip(path, dest, max_bytes, written):
    total = 0
    with zipfile.ZipFile(path) as zf:
        for info in zf.infolist():
            mode = (info.external_attr >> 16) & 0o170000
            if mode == 0o120000:
                raise ValueError("symlink in archive")
            if info.is_dir():
                target = safe_target(dest, info.filename)
                if target:
                    os.makedirs(target, exist_ok=True)
                continue
            target = safe_target(dest, info.filename)
            if not target:
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            with zf.open(info, "r") as src, open(target, "wb") as out:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("archive expands past the size limit")
                    out.write(chunk)
            written.append(os.path.relpath(target, dest).replace(os.sep, "/"))


def extract_tar(path, dest, max_bytes, written):
    total = 0
    with tarfile.open(path, "r:*") as tf:
        for member in tf.getmembers():
            if member.issym() or member.islnk():
                raise ValueError("symlink in archive")
            if member.isdev() or member.isfifo():
                continue
            target = safe_target(dest, member.name)
            if not target:
                continue
            if member.isdir():
                os.makedirs(target, exist_ok=True)
                continue
            if not member.isfile():
                continue
            os.makedirs(os.path.dirname(target), exist_ok=True)
            src = tf.extractfile(member)
            if src is None:
                continue
            with src, open(target, "wb") as out:
                while True:
                    chunk = src.read(1024 * 1024)
                    if not chunk:
                        break
                    total += len(chunk)
                    if total > max_bytes:
                        raise ValueError("archive expands past the size limit")
                    out.write(chunk)
            written.append(os.path.relpath(target, dest).replace(os.sep, "/"))


def main():
    kind, archive, dest, max_bytes = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
    os.makedirs(dest, exist_ok=True)
    written = []
    if kind == "zip":
        extract_zip(archive, dest, max_bytes, written)
    elif kind == "tar":
        extract_tar(archive, dest, max_bytes, written)
    else:
        raise ValueError("unsupported archive")
    print(json.dumps(written))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
