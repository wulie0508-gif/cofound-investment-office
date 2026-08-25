#!/usr/bin/env python3
"""Run the installed filehelper router and emit a BP-only attachment snapshot.

This adapter does not copy account IDs, historical messages, cookies, or the
private knowledge base into Cofound BP Desk. It extends the existing scoped
Frida scan in memory and only persists trigger IDs plus supported filenames.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
from pathlib import Path
import sys
from typing import Any


SUPPORTED = {
    ".pdf", ".ppt", ".pptx", ".doc", ".docx", ".md", ".markdown", ".txt",
    ".xlsx", ".xls", ".csv", ".html", ".htm", ".json", ".png", ".jpg", ".jpeg", ".webp", ".zip",
    ".m4a", ".mp3", ".wav",
}


def write_json_atomic(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + f".{os.getpid()}.tmp")
    temporary.write_text(
        json.dumps(value, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    os.replace(temporary, path)


def read_json(path: Path, fallback: Any) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return fallback


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--router-root", required=True, type=Path)
    parser.add_argument("--snapshot", required=True, type=Path)
    parser.add_argument("--trigger-phrase", default="存入项目库")
    parser.add_argument("--seconds", type=int, default=120)
    args = parser.parse_args()

    scanner_path = (
        args.router_root
        / "scripts"
        / "frida_route"
        / "run_frida_scan.py"
    ).resolve()
    if not scanner_path.is_file():
        print("未找到已安装的微信内容路由器", file=sys.stderr)
        return 2

    spec = importlib.util.spec_from_file_location(
        "cofound_wechat_router", scanner_path
    )
    if spec is None or spec.loader is None:
        print("无法加载微信内容路由器", file=sys.stderr)
        return 2
    router = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(router)

    needle = "                for (const u of extractUrlsFromRecord(recordText)) kept.add(u);"
    injection = r'''
                // Cofound adapter: keep only supported attachment filenames from
                // records already proven to belong to filehelper. Never persist
                // the surrounding message body.
                for (const cellText of strCols) {
                    const trimmed = cellText.trim();
                    const candidates = [];
                    const titleMatch = trimmed.match(/<title>([^<>]{1,180}\.(?:pdf|ppt|pptx|doc|docx|md|markdown|txt|xlsx|xls|csv|html|htm|json|png|jpg|jpeg|webp|zip|m4a|mp3|wav))<\/title>/i);
                    if (titleMatch) candidates.push(titleMatch[1]);
                    if (/^[^<>:"\/\\|?*\r\n]{1,180}\.(?:pdf|ppt|pptx|doc|docx|md|markdown|txt|xlsx|xls|csv|html|htm|json|png|jpg|jpeg|webp|zip|m4a|mp3|wav)$/i.test(trimmed)) {
                        candidates.push(trimmed);
                    }
                    for (const filename of candidates) {
                        send({type: "attachment_hit",
                              id: "file:" + numericCols.slice(0, 6).join(":") + ":" + pageNo + ":" + filename,
                              filename: filename.substring(0, 200)});
                    }
                }
'''
    if needle not in router.JS_CODE:
        print("微信路由器版本不兼容：无法安装附件适配钩子", file=sys.stderr)
        return 2
    router.JS_CODE = router.JS_CODE.replace(needle, injection + needle, 1)

    attachment_hits: dict[str, dict[str, str]] = {}
    original_handler = router.on_message

    def on_message(message: dict[str, Any], data: Any, state: dict[str, Any]):
        if message.get("type") == "send":
            payload = message.get("payload") or {}
            if payload.get("type") == "attachment_hit":
                hit_id = str(payload.get("id") or "")
                filename = Path(str(payload.get("filename") or "")).name.strip()
                if (
                    hit_id
                    and filename
                    and Path(filename).suffix.lower() in SUPPORTED
                ):
                    attachment_hits[hit_id] = {
                        "id": hit_id,
                        "filename": filename,
                    }
                return
        original_handler(message, data, state)

    router.on_message = on_message
    sys.argv = [
        str(scanner_path),
        "--seconds",
        str(max(30, min(args.seconds, 240))),
        "--chat-username",
        "filehelper",
        "--trigger-phrase",
        args.trigger_phrase,
    ]
    try:
        router.main()
    except SystemExit as error:
        return int(error.code or 1)

    output_dir = scanner_path.parent / "output"
    filter_info = read_json(output_dir / "filter_info.json", {})
    if not filter_info.get("applied") or filter_info.get("chat_username") != "filehelper":
        print("无法严格确认文件传输助手会话，未生成 BP 收件快照", file=sys.stderr)
        return 3
    triggers = read_json(output_dir / "trigger_hits.json", [])
    write_json_atomic(
        args.snapshot.resolve(),
        {
            "generatedAt": __import__("datetime").datetime.now(
                __import__("datetime").timezone.utc
            ).isoformat(),
            "scopeVerified": True,
            "chatUsername": "filehelper",
            "triggerPhrase": args.trigger_phrase,
            "triggers": [
                {"id": str(item.get("id") or ""), "phrase": args.trigger_phrase}
                for item in triggers
                if item.get("id")
            ],
            "attachments": list(attachment_hits.values()),
        },
    )
    print(
        f"filehelper snapshot ready: {len(triggers)} triggers, "
        f"{len(attachment_hits)} supported attachments"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
