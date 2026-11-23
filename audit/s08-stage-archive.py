#!/usr/bin/env python3
"""S08 : réception privée d'une archive ZIP, vérification et staging PostgreSQL local.
Ne touche jamais à Supabase, GitHub distant, Auth ou Storage.
Usage : python3 audit/s08-stage-archive.py s08-transfer.zip [--verify-only]
Le ZIP doit contenir manifest.json, garage-data.json et files/ (avec ou sans dossier parent).
"""
import argparse
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile

MAX_FILES = 1000
MAX_TOTAL = 250 * 1024 * 1024
MAX_ZIP = 100 * 1024 * 1024


def receive(archive):
    archive = pathlib.Path(archive).expanduser().resolve(strict=True)
    if archive.stat().st_size > MAX_ZIP:
        raise ValueError("Archive trop volumineuse")
    private_root = pathlib.Path.home() / ".local" / "share" / "atelier-s08-private"
    private_root.mkdir(parents=True, exist_ok=True, mode=0o700)
    private_root.chmod(0o700)
    target = pathlib.Path(tempfile.mkdtemp(prefix="backup-", dir=private_root))
    target.chmod(0o700)
    try:
        with zipfile.ZipFile(archive) as z:
            entries = z.infolist()
            if not entries or len(entries) > MAX_FILES:
                raise ValueError("Nombre de fichiers invalide")
            if sum(x.file_size for x in entries) > MAX_TOTAL:
                raise ValueError("Archive décompressée trop volumineuse")
            for item in entries:
                name = item.filename
                p = pathlib.PurePosixPath(name)
                if (not name or name.startswith("/") or "\\" in name or
                    any(part in ("", ".", "..") for part in p.parts) or
                    (item.external_attr >> 16) & 0o170000 == stat.S_IFLNK):
                    raise ValueError("Entrée ZIP dangereuse")
                dest = target.joinpath(*p.parts)
                if not dest.resolve().is_relative_to(target):
                    raise ValueError("Chemin hors répertoire")
                if item.is_dir():
                    dest.mkdir(parents=True, exist_ok=True)
                else:
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(item) as source, dest.open("xb") as output:
                        shutil.copyfileobj(source, output, length=1024 * 1024)
        manifests = list(target.rglob("manifest.json"))
        if len(manifests) != 1:
            raise ValueError("Il faut exactement un manifest.json")
        folder = manifests[0].parent
        if not (folder / "garage-data.json").is_file():
            raise ValueError("garage-data.json manquant")
        return folder
    except BaseException:
        shutil.rmtree(target, ignore_errors=True)
        raise


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("archive")
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()
    folder = receive(args.archive)
    audit = pathlib.Path(__file__).resolve().parent
    script = audit / ("s08-verify-partial-export.cjs" if args.verify_only else "s08-stage-local-postgres.cjs")
    result = subprocess.run(["node", str(script), str(folder)], check=False)
    if result.returncode:
        print("S08_REFUSED : validation ou staging échoué. Archive privée extraite dans : " + str(folder), file=sys.stderr)
        return result.returncode
    print("S08_ARCHIVE_OK : dossier privé " + str(folder))
    print("ATTENTION : sauvegarde partielle ; aucune restauration applicative.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, zipfile.BadZipFile) as e:
        print("S08_ARCHIVE_REFUSED : " + str(e), file=sys.stderr)
        sys.exit(1)
