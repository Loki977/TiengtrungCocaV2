#!/usr/bin/env python3
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import argparse
import os

def main():
    parser = argparse.ArgumentParser(description="Chạy website tĩnh để thử ThiThu.html.")
    parser.add_argument("--port", type=int, default=5500)
    parser.add_argument("--root", default=".")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.exists():
        raise SystemExit(f"Không tìm thấy thư mục: {root}")

    os.chdir(root)
    server = ThreadingHTTPServer(("127.0.0.1", args.port), SimpleHTTPRequestHandler)
    print(f"Mở: http://127.0.0.1:{args.port}/ThiThu.html")
    print("Nhấn Ctrl+C để dừng.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nĐã dừng.")

if __name__ == "__main__":
    main()
