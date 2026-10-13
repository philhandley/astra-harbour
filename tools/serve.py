"""A no-cache static server for local testing: python tools/serve.py 8600

Like `python -m http.server`, plus:
  Cache-Control: no-store on everything, so changed ES modules reload.
  PUT /__shot/<name>  saves a JPEG or PNG body to dev/shots/<name>.(jpg|png) (git-ignored) for tests that capture a canvas.
  GET /__wait/<name>?t=60  holds until PUT /__done/<name> arrives (or t seconds), so a headless browser's load event
                           (and so --screenshot / --dump-dom) waits for the page to say it is ready.
Listens on 127.0.0.1 only.
"""
import re
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / 'dev' / 'shots'


DONE = {}
LOCK = threading.Lock()


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        m = re.match(r'/__wait/([a-z0-9_-]+)(?:\?t=(\d+))?', self.path)
        if m:
            name, secs = m.group(1), min(300, int(m.group(2) or 60))
            end = time.time() + secs
            while time.time() < end:
                with LOCK:
                    if DONE.pop(name, None):
                        break
                time.sleep(0.05)
            body = bytes.fromhex('47494638396101000100800000ffffff00000021f90401000000002c00000000010001000002024401003b')
            self.send_response(200)
            self.send_header('Content-Type', 'image/gif')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        return super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_PUT(self):
        d = re.fullmatch(r'/__done/([a-z0-9_-]+)', self.path)
        if d:
            with LOCK:
                DONE[d.group(1)] = True
            self.send_response(204)
            self.end_headers()
            return
        m = re.fullmatch(r'/__shot/([a-z0-9_-]+)', self.path)
        if not m:
            return self.send_error(404)
        n = int(self.headers.get('Content-Length', '0'))
        if n <= 0 or n > 20_000_000:
            return self.send_error(400)
        body = self.rfile.read(n)
        ext = 'png' if body[:4] == b'\x89PNG' else 'jpg'
        SHOTS.mkdir(parents=True, exist_ok=True)
        (SHOTS / f'{m.group(1)}.{ext}').write_bytes(body)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8600
print(f'serving {ROOT} on http://127.0.0.1:{port}')
ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(ROOT))).serve_forever()
