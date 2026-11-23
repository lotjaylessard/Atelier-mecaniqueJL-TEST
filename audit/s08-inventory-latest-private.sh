#!/usr/bin/env bash
# S08 : rapport métier sur la dernière archive privée, sans PostgreSQL ni réseau.
set -euo pipefail
root="${HOME}/.local/share/atelier-s08-private"
if [[ ! -d "$root" ]]; then
  echo "S08_PRIVATE_BACKUP_NOT_FOUND : aucun dossier privé local." >&2
  exit 2
fi
mapfile -d '' manifests < <(find "$root" -type f -name manifest.json -print0)
if (( ${#manifests[@]} == 0 )); then
  echo "S08_PRIVATE_BACKUP_NOT_FOUND : aucun manifest.json." >&2
  exit 2
fi
latest=""
for manifest in "${manifests[@]}"; do
  if [[ -z "$latest" || "$manifest" -nt "$latest" ]]; then latest="$manifest"; fi
done
folder="${latest%/manifest.json}"
echo "S08_INVENTORY_SOURCE : archive privée locale (aucune donnée publiée)"
node "$(dirname "$0")/s08-business-inventory.cjs" "$folder"
