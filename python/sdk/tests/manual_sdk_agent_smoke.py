"""Drive the repo-source dao SDK profile through the SDK and a keyless mock SSE server.

Requires ``pnpm install`` but no build. This manual test is not collected by
pytest; run ``python tests/manual_sdk_agent_smoke.py``.
"""

from __future__ import annotations

import argparse
import json
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from dao import DaoHarness
from dao.api import base_url_patch_content


class MockCompletionHandler(BaseHTTPRequestHandler):
    requests: list[dict[str, Any]] = []

    def do_POST(self) -> None:
        length = int(self.headers.get("content-length", "0"))
        body = self.rfile.read(length).decode("utf-8")
        self.requests.append({
            "path": self.path,
            "authorization": self.headers.get("authorization"),
            "body": json.loads(body),
        })
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        self.wfile.write(b'data: {"choices":[{"delta":{"role":"assistant","content":null,"reasoning_content":""}}]}\n\n')
        self.wfile.write(b'data: {"choices":[{"delta":{"content":"SDK runtime reached the configured HTTP model endpoint."}}]}\n\n')
        self.wfile.write(b'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}],"usage":{"prompt_tokens":7,"completion_tokens":9}}\n\n')
        self.wfile.write(b"data: [DONE]\n\n")

    def log_message(self, _format: str, *_args: object) -> None:
        return


def run_smoke(repo_root: Path, keep_sessions: bool) -> None:
    dao_home = Path(tempfile.mkdtemp(prefix="dao-sdk-smoke-home-"))
    session_root = dao_home / "sessions"
    runtime_entry = repo_root / "apps/cli/src/bin.ts"
    server = ThreadingHTTPServer(("127.0.0.1", 0), MockCompletionHandler)
    thread = threading.Thread(target=server.serve_forever, name="mock-openai-compatible-server", daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_address[1]}"
    base_patch = dao_home / "base-url.patch.yml"
    dao_home.mkdir(parents=True, exist_ok=True)
    base_patch.write_text(
        base_url_patch_content(base_url, "Qwen3.8-27B-Q6_K_XL-128K"), encoding="utf-8"
    )

    print(f"repo_root={repo_root}")
    print(f"dao_home={dao_home}")
    print(f"mock_base_url={base_url}")

    try:
        with DaoHarness(
            model="Qwen3.8-27B-Q6_K_XL-128K",
            cwd=str(repo_root / "python/sdk"),
            runtime_cwd=str(repo_root),
            _launch_args=(
                "node",
                "--import",
                "tsx",
                str(runtime_entry),
                "--profile",
                "sdk",
                "--patch",
                str(base_patch),
            ),
            env={
                "DAO_HOME": str(dao_home),
                "DAO_PERMISSION_MODE": "danger-full-access",
                "DAO_TELEMETRY_DISABLED": "1",
                "LLAMA_ROUTER_API_KEY": "sdk-smoke-key",
            },
            request_timeout_seconds=20,
            shutdown_timeout_seconds=2,
        ) as harness:
            result = harness.run(
                "Please reply with a short confirmation and do not call tools.",
                session_id="sdk-smoke-main",
            )
        print(f"final_response={result.final_response}")
        assert "configured HTTP model endpoint" in result.final_response
        assert len(MockCompletionHandler.requests) == 1
        request = MockCompletionHandler.requests[0]
        print(json.dumps(request, ensure_ascii=False, indent=2)[:4000])
        assert request["authorization"] == "Bearer sdk-smoke-key"
        assert request["body"]["model"] == "Qwen3.8-27B-Q6_K_XL-128K"

        jsonl_files = sorted(session_root.rglob("*.jsonl.zstd"))
        assert jsonl_files, f"no Zstandard JSONL sessions were written under {session_root}"
        print("session_jsonl_zstd_files:")
        for path in jsonl_files:
            print(f"  {path} bytes={path.stat().st_size}")
            assert path.read_bytes().startswith(bytes.fromhex("28b52ffd"))
    finally:
        server.shutdown()
        server.server_close()

    if keep_sessions:
        print(f"kept_dao_home={dao_home}")
    else:
        shutil.rmtree(dao_home)
        print("removed temporary dao home")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[3],
        help="Path to the Dao checkout.",
    )
    parser.add_argument("--keep-sessions", action="store_true")
    args = parser.parse_args()
    run_smoke(args.repo_root.resolve(), args.keep_sessions)


if __name__ == "__main__":
    main()
