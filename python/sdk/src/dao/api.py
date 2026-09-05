from __future__ import annotations

import os
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from .client import HarnessClient, HarnessConfig
from .errors import SdkProtocolError
from .models import JsonObject, Notification


def base_url_patch_content(base_url: str, model: str) -> str:
    """Build the ``--patch`` overlay that points llama-router at ``base_url``.

    The entry replaces the profile's llm-pi-ai row wholesale and names the
    requested model, so it applies to every profile, including ``sdk-minimal``,
    which mounts no settings plugin. The window/token figures are catalog
    hints; the endpoint owns the effective limits.
    """
    return (
        "- id: llm-pi-ai\n"
        "  name: '@daoai/dao-llm-pi-ai'\n"
        "  config:\n"
        "    providers:\n"
        "      llama-router:\n"
        "        displayName: Llama Router\n"
        "        apiKeyEnv: LLAMA_ROUTER_API_KEY\n"
        "        api: openai-completions\n"
        f"        baseURL: {base_url}\n"
        "        models:\n"
        f"          - id: {model}\n"
        "            contextWindow: 131072\n"
        "            maxTokens: 65536\n"
        "            reasoningEfforts:\n"
        "              max: max\n"
    )


@dataclass(slots=True)
class DaoHarnessConfig:
    """Configuration for launching the local Dao SDK runtime.

    The runtime inherits the caller's environment by default, so an existing
    LLAMA_ROUTER_API_KEY in the environment is used by the shipped
    llama-router route. Use ``env`` to intentionally override or inject
    variables for a subprocess.

    ``base_url`` points the llama-router route at another endpoint: the SDK
    writes a self-contained ``llm-pi-ai`` overlay and appends it as the final
    ``--patch``, so it wins over the profile and any home patch for this
    launch only and never touches the user's home.
    """

    provider: str = "llama-router"
    model: str = "Qwen3.8-27B-Q6_K_XL-128K"
    reasoning_effort: str | None = None
    max_tokens: int | None = None
    cwd: str | None = None
    runtime_cwd: str | None = None
    dao_bin: str | None = None
    profile: str = "sdk"
    patches: tuple[str, ...] = ()
    dao_home: str | None = None
    env: dict[str, str] = field(default_factory=dict)
    initialize_timeout_seconds: float = 30.0
    request_timeout_seconds: float | None = None
    shutdown_timeout_seconds: float | None = 1.0
    base_url: str | None = None
    api_key: str | None = None


@dataclass(slots=True)
class RunResult:
    session_id: str
    final_response: str
    finish_reason: str | None
    events: list[JsonObject]
    notifications: list[Notification]


class DaoHarness:
    """Reusable synchronous SDK for running Dao agent turns.

    The runtime subprocess starts lazily and remains owned by this instance
    across calls to :meth:`run`. Use the instance as a context manager, or call
    :meth:`close` explicitly when finished, so the subprocess is always reaped.
    """

    def __init__(
        self,
        config: DaoHarnessConfig | None = None,
        *,
        _launch_args: tuple[str, ...] | None = None,
        **kwargs: object,
    ) -> None:
        if config is not None and kwargs:
            raise TypeError("pass either DaoHarnessConfig or keyword options, not both")
        self.config = config or DaoHarnessConfig(**kwargs)
        cwd = str(Path(self.config.cwd or Path.cwd()).resolve())
        runtime_cwd = str(Path(self.config.runtime_cwd).resolve()) if self.config.runtime_cwd is not None else cwd
        self._cwd = cwd
        env = dict(self.config.env)
        if self.config.api_key is not None:
            env["LLAMA_ROUTER_API_KEY"] = self.config.api_key

        self._base_url = self.config.base_url
        self._base_url_model = self.config.model
        self._base_url_patch: Path | None = None
        patches = tuple(self.config.patches)
        if self._base_url is not None:
            self._base_url_patch = self._new_base_url_patch_path()
            patches = (*patches, str(self._base_url_patch))
            self._write_base_url_patch()

        self._client = HarnessClient(
            HarnessConfig(
                dao_bin=self.config.dao_bin,
                profile=self.config.profile,
                patches=patches,
                dao_home=self.config.dao_home,
                cwd=runtime_cwd,
                env=env,
                initialize_timeout_seconds=self.config.initialize_timeout_seconds,
                request_timeout_seconds=self.config.request_timeout_seconds,
                shutdown_timeout_seconds=self.config.shutdown_timeout_seconds,
            ),
            _launch_args=_launch_args,
        )
        self._initialized = False

    def _new_base_url_patch_path(self) -> Path:
        handle, raw = tempfile.mkstemp(prefix="dao-sdk-base-url-", suffix=".patch.yml")
        os.close(handle)
        return Path(raw)

    def _write_base_url_patch(self) -> None:
        if self._base_url_patch is not None and self._base_url is not None:
            self._base_url_patch.write_text(
                base_url_patch_content(self._base_url, self._base_url_model), encoding="utf-8"
            )

    def _remove_base_url_patch(self) -> None:
        if self._base_url_patch is not None:
            self._base_url_patch.unlink(missing_ok=True)

    def __enter__(self) -> "DaoHarness":
        self.start()
        return self

    def __exit__(self, _exc_type, _exc, _tb) -> None:
        self.close()

    @property
    def client(self) -> HarnessClient:
        return self._client

    def start(self) -> None:
        if self._initialized:
            return
        self._write_base_url_patch()
        self._client.start()
        self._client.initialize(
            cwd=self._cwd,
            provider=self.config.provider,
            model=self.config.model,
            reasoning_effort=self.config.reasoning_effort,
            max_tokens=self.config.max_tokens,
        )
        self._initialized = True

    def close(self) -> None:
        self._client.close()
        self._initialized = False
        self._remove_base_url_patch()

    def start_session(self, session_id: str | None = None) -> "Session":
        self.start()
        return Session(self, session_id or f"session-{uuid.uuid4().hex}")

    def run(
        self,
        input: str | list[JsonObject],
        *,
        session_id: str | None = None,
        on_notification: Callable[[Notification], None] | None = None,
    ) -> RunResult:
        return self.start_session(session_id).run(input, on_notification=on_notification)


class Session:
    def __init__(self, harness: DaoHarness, session_id: str) -> None:
        self.harness = harness
        self.id = session_id

    def run(
        self,
        input: str | list[JsonObject],
        *,
        on_notification: Callable[[Notification], None] | None = None,
    ) -> RunResult:
        content_blocks = normalize_input(input)
        notifications: list[Notification] = []
        events: list[JsonObject] = []

        def collect(notification: Notification) -> None:
            notifications.append(notification)
            if on_notification is not None:
                on_notification(notification)
            if (
                notification.method == "session.event"
                and notification.payload.get("sessionId") == self.id
            ):
                event = notification.payload.get("event")
                if isinstance(event, dict):
                    events.append(event)

        with self.harness.client.subscribe_session_notifications(self.id) as subscription:
            message_id = self.harness.client.session_prompt(
                self.id,
                content_blocks,
                notification_subscription=subscription,
            )

            received = False
            while True:
                notification = subscription.next()
                if not received:
                    if not _is_inbox_receipt(notification, self.id, message_id):
                        continue
                    received = True
                collect(notification)
                if (
                    notification.method == "session.status"
                    and notification.payload.get("sessionId") == self.id
                    and notification.payload.get("status") == "idle"
                ):
                    break

        return RunResult(
            session_id=self.id,
            final_response=final_response(events),
            finish_reason=finish_reason(events),
            events=events,
            notifications=notifications,
        )


def _is_inbox_receipt(notification: Notification, session_id: str, message_id: str) -> bool:
    if notification.method != "session.event" or notification.payload.get("sessionId") != session_id:
        return False
    event = notification.payload.get("event")
    if not isinstance(event, dict) or event.get("type") != "agent/inbox/spliced":
        return False
    data = event.get("data")
    inserted = data.get("inserted") if isinstance(data, dict) else None
    return isinstance(inserted, list) and any(
        isinstance(message, dict) and message.get("id") == message_id for message in inserted
    )


def normalize_input(input: str | list[JsonObject]) -> list[JsonObject]:
    if isinstance(input, str):
        return [{"type": "text", "text": input}]
    return input


def final_response(events: list[JsonObject]) -> str:
    for event in reversed(events):
        if event.get("type") != "assistant/message":
            continue
        data = event.get("data")
        if not isinstance(data, dict):
            continue
        message = data.get("message")
        content_owner = message if isinstance(message, dict) else data
        content = content_owner.get("content")
        if not isinstance(content, list):
            continue
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
        return "".join(parts)
    return ""


def finish_reason(events: list[JsonObject]) -> str | None:
    """Return the last turn-ending kind.

    The input must contain root-session events from one owned run interval.

    Raises:
        SdkProtocolError: The last ``turn/end`` has no string reason kind.
    """
    for event in reversed(events):
        if event.get("type") != "turn/end":
            continue
        data = event.get("data")
        reason = data.get("reason") if isinstance(data, dict) else None
        kind = reason.get("kind") if isinstance(reason, dict) else None
        if not isinstance(kind, str):
            raise SdkProtocolError("turn/end event requires a string data.reason.kind")
        return kind
    return None
