"""Serve a local, isolated S08 TEST preview. Never deploy to the production site."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Timer
import os
import webbrowser

os.chdir(Path(__file__).resolve().parent)
try:
    # CI may choose port 0 (OS-assigned); Windows launcher stays on 8765.
    port = int(os.environ.get("S08_PREVIEW_PORT", "8765"))
    if port != 0 and not (1024 <= port <= 65535):
        raise ValueError("Port aperçu S08 invalide")
    server = ThreadingHTTPServer(("127.0.0.1", port), SimpleHTTPRequestHandler)
except OSError as error:
    raise SystemExit("Le port local 8765 est déjà utilisé. Ferme l'ancien serveur S08 puis réessaie.") from error

url = f"http://127.0.0.1:{server.server_port}/login.html"
print("\nGarage Atelier J.L. — APERÇU S08 TEST")
print("Serveur local uniquement :", url)
print("Ce site communique avec Supabase TEST (nraijzsodgojkpyigefu).")
print("Pour arrêter le serveur : Ctrl+C.\n", flush=True)
if os.environ.get("S08_NO_BROWSER") != "1":
    Timer(1.2, lambda: webbrowser.open(url)).start()
try:
    server.serve_forever()
except KeyboardInterrupt:
    print("\nServeur S08 arrêté.")
finally:
    server.server_close()
