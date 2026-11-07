"""Download the CC0 Poly Haven textures and models the map build reads.

Every file, author and URL is pinned in sources/map-sources.json; each download
is verified against its recorded SHA-256. Runs with plain python3, no Blender.
"""

import hashlib
import json
import os
import sys
import urllib.request

DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "sources")


def main():
    table = json.load(open(os.path.join(DIR, "map-sources.json")))
    for asset in table["assets"]:
        for f in asset["files"]:
            path = os.path.join(DIR, f["file"])
            if not os.path.exists(path):
                os.makedirs(os.path.dirname(path), exist_ok=True)
                req = urllib.request.Request(f["url"], headers={"User-Agent": "car-game-art-pipeline"})
                open(path, "wb").write(urllib.request.urlopen(req).read())
            if hashlib.sha256(open(path, "rb").read()).hexdigest() != f["sha256"]:
                sys.exit(f"checksum mismatch: {f['file']}")
    print("map sources ready")


main()
