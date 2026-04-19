import http.server
import socketserver
import os

PORT = 8080
# os.chdir(os.path.dirname(os.path.abspath(__file__))) # Already in correct Cwd via run_command
Handler = http.server.SimpleHTTPRequestHandler

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving at http://localhost:{PORT}")
    httpd.serve_forever()
