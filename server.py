import http.server
import socketserver
import os

PORT = 8080
os.chdir(r"e:\Celestial-Explorer")
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
