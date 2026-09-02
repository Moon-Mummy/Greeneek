"""Greeneek Python client.

Tiny sync/async client for the Greeneek harness HTTP seam. Mirrors the
TypeScript SDK surface: create session, stream a task, dump config, usage.
"""

from __future__ import annotations

import json
import urllib.request
from typing import Any, Iterator


class GreeneekError(RuntimeError):
    pass


class Greeneek:
    def __init__(self, endpoint: str = "http://127.0.0.1:3080", api_key: str | None = None):
        self.endpoint = endpoint.rstrip("/")
        self.api_key = api_key

    def _request(self, method: str, path: str, body: dict | None = None) -> Any:
        headers = {"content-type": "application/json"}
        if self.api_key:
            headers["authorization"] = f"Bearer {self.api_key}"
        req = urllib.request.Request(
            self.endpoint + path,
            data=json.dumps(body).encode() if body is not None else None,
            headers=headers,
            method=method,
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as err:
            raise GreeneekError(f"{method} {path} -> {err.code}: {err.read().decode()}") from err

    def meta(self) -> dict:
        return self._request("GET", "/api/meta")

    def create_session(self) -> str:
        return self._request("POST", "/api/sessions", {})["id"]

    def run(self, task: str) -> Iterator[dict]:
        """Stream session events (SSE)."""
        session_id = self.create_session()
        req = urllib.request.Request(
            self.endpoint + f"/api/sessions/{session_id}/run",
            data=json.dumps({"task": task}).encode(),
            headers={"content-type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=300) as res:
            for raw in res:
                line = raw.decode().strip()
                if line.startswith("data: "):
                    yield json.loads(line[6:])

    def dump_config(self) -> dict:
        return self._request("GET", "/api/config/dump")

    def usage(self) -> dict:
        return self._request("GET", "/api/usage")
