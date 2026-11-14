"""S08 TEST: offline, temporary-directory restoration rehearsal of physical backup.
Never writes to Supabase, never reads cloud secrets or modifies the source backup.
Usage: python audit/s08-verify-physical-backup.py PATH_TO_EXPORTED_BACKUP_FOLDER
"""
from pathlib import Path
import hashlib
import json
import os
import shutil
import sys
import tempfile


def clean_path(value):
    return (
        isinstance(value, str) and 0 < len(value) < 2048
        and not value.startswith("/") and "\\" not in value
        and "\0" not in value
        and all(segment not in ("", ".", "..") and len(segment) < 256
                for segment in value.split("/"))
    )


def load_json(file):
    if not file.is_file() or file.is_symlink():
        raise ValueError("Fichier JSON manquant ou lien symbolique")
    return json.loads(file.read_text(encoding="utf-8"))


def digest(file):
    h = hashlib.sha256()
    size = 0
    with file.open("rb") as src:
        while True:
            part = src.read(1024 * 1024)
            if not part:
                break
            h.update(part)
            size += len(part)
    return h.hexdigest(), size


def verify(directory):
    root = Path(directory).resolve(strict=True)
    manifest = load_json(root / "manifest.json")
    snapshot = load_json(root / "garage-data.json")
    if manifest.get("format") != "atelier-test-physical-backup-v1":
        raise ValueError("Format du manifeste inattendu")
    if manifest.get("status") != "COMPLETE" or manifest.get("bytesIncluded") is not True:
        raise ValueError("La sauvegarde n'est pas marquée COMPLETE")
    if manifest.get("failed") or manifest.get("unresolvedReferences"):
        raise ValueError("Le manifeste contient des erreurs ou références manquantes")
    owner = manifest.get("accountId")
    if not isinstance(owner, str) or not owner or owner != snapshot.get("accountId"):
        raise ValueError("Compte différent entre manifeste et données")
    if snapshot.get("format") != "atelier-test-full-garage-snapshot-v1":
        raise ValueError("Format des données du garage inattendu")
    garages = snapshot.get("garages")
    quotes = snapshot.get("quotes")
    if not isinstance(garages, list) or not isinstance(quotes, list):
        raise ValueError("Garages ou soumissions absents")
    if any(g.get("user_id") != owner for g in garages):
        raise ValueError("Un garage appartient à un autre compte")
    if any(q.get("user_id") != owner for q in quotes):
        raise ValueError("Une soumission appartient à un autre compte")
    if manifest.get("garageCount") != len(garages) or manifest.get("quoteCount") != len(quotes):
        raise ValueError("Compteurs des données incohérents")
    refs = set()
    for garage in garages:
        for wo in garage.get("data", {}).get("workorders", []):
            for attachment in wo.get("attachments", []):
                refs.add(attachment.get("path"))
    if any(not clean_path(ref) for ref in refs):
        raise ValueError("Référence de BT non sécuritaire")
    if manifest.get("referencedPaths") != len(refs):
        raise ValueError("Nombre de références incorrect")
    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise ValueError("Inventaire des fichiers absent")
    if manifest.get("fileCount") != len(entries):
        raise ValueError("Nombre de fichiers incohérent")
    names = set()
    bytes_total = 0
    with tempfile.TemporaryDirectory(prefix="s08-restore-test-") as temp:
        staged = Path(temp)
        # Copy a separate copy into a sandbox, then independently check hashes.
        shutil.copy2(root / "garage-data.json", staged / "garage-data.json")
        for entry in entries:
            name = entry.get("path")
            if not clean_path(name) or name in names:
                raise ValueError("Fichier doublonné ou chemin interdit")
            names.add(name)
            src = root / "files" / name
            if not src.is_file() or src.is_symlink():
                raise ValueError("Octets physiques manquants : " + name)
            if any(parent.is_symlink() for parent in list(src.parents) if parent != root
                   and root in parent.parents):
                raise ValueError("Chemin physique lié symboliquement")
            expected_hash = entry.get("sha256")
            expected_size = entry.get("bytes")
            if not isinstance(expected_hash, str) or len(expected_hash) != 64:
                raise ValueError("Empreinte SHA-256 absente")
            if type(expected_size) is not int or expected_size < 0:
                raise ValueError("Taille de fichier non valide")
            actual_hash, actual_size = digest(src)
            if actual_hash != expected_hash or actual_size != expected_size:
                raise ValueError("Fichier altéré ou incomplet : " + name)
            destination = staged / "files" / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, destination)
            test_hash, test_size = digest(destination)
            if test_hash != expected_hash or test_size != expected_size:
                raise ValueError("Restauration temporaire incorrecte : " + name)
            bytes_total += actual_size
        if not refs.issubset(names):
            raise ValueError("Références de BT sans fichier restauré")
        if manifest.get("totalBytes") != bytes_total:
            raise ValueError("Total d'octets incohérent")
        if not (staged / "garage-data.json").is_file():
            raise ValueError("Copie temporaire JSON manquante")
    return {"status": "PASS", "files": len(entries), "bytes": bytes_total,
            "garages": len(garages), "quotes": len(quotes)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit("Usage : python s08-verify-physical-backup.py DOSSIER_SAUVEGARDE")
    try:
        result = verify(sys.argv[1])
        print("S08 SAUVEGARDE / RESTAURATION ISOLEE : PASS")
        print("Fichiers vérifiés : {} ; octets : {} ; garages : {} ; soumissions : {}"
              .format(result["files"], result["bytes"], result["garages"], result["quotes"]))
        print("Aucune donnée Supabase modifiée. Dossier temporaire effacé.")
    except Exception as error:
        print("S08 SAUVEGARDE / RESTAURATION ISOLEE : FAIL", file=sys.stderr)
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
