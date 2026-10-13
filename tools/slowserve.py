"""A static server for offline tests: like `python -m http.server`, plus /__slow which waits a second
and /__hold which keeps a page's load event waiting, so a headless browser using --dump-dom stays put.
Usage: python tools/slowserve.py 8601"""
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path.startswith('/__hold'):
            secs = 40
            try:
                secs = min(300, int(self.path.split('s=')[1].split('&')[0]))
            except (IndexError, ValueError):
                pass
            time.sleep(secs)
            body = b'<!doctype html><title>held</title>'
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path.startswith('/__slow'):
            time.sleep(1)
            self.send_response(204)
            self.end_headers()
            return
        super().do_GET()

    def log_message(self, *a):
        pass


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8601
ThreadingHTTPServer(('127.0.0.1', port), partial(Handler, directory=str(ROOT))).serve_forever()
