#!/usr/bin/env python3
"""Fail on real placeholder secret assignments in docs and env examples.

Matches only lines of the form NAME=change-me or NAME=neighborly-secret.
NAME may include digits, so S3_SECRET_KEY is included.
Prose that names those strings as rejected placeholders does not match:
docs/DEPLOYMENT.md (the boot-rule table), docs/LAUNCH_CHECKLIST.md, and
the comment in env.production.example.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# Digits are included so S3_SECRET_KEY is an assignment. The value is exact.
ASSIGNMENT = re.compile(r"^[A-Z][A-Z0-9_]*=(change-me|neighborly-secret)\s*$")

# These lines mention the rejected placeholders on purpose. They must not match.
SAFE_LINES = (
    "| `JWT_SECRET` | Must not be a placeholder (`change-me`, `replace-with`, …) and must not be low-diversity. |",
    "| `JWT_SECRET` | BLOCKED | Required. At least 32 characters. In production it must not match a placeholder (`change-me`, `replace-with`, `changeme`, `jwt_secret`, or the exact words `secret`, `password`, `neighborly`) and must contain at least 8 distinct characters |",
    "# Production also rejects placeholders (change-me, replace-with, changeme,",
)
BAD_LINES = (
    "JWT_SECRET=change-me",
    "JWT_REFRESH_SECRET=change-me",
    "S3_SECRET_KEY=neighborly-secret",
)


def files() -> list[Path]:
    found: list[Path] = []
    docs = ROOT / "docs"
    if docs.is_dir():
        found.extend(path for path in docs.rglob("*") if path.is_file())
    found.extend(path for path in ROOT.glob("env*.example") if path.is_file())
    return found


def main() -> int:
    errors: list[str] = []
    for line in SAFE_LINES:
        if ASSIGNMENT.match(line):
            errors.append(f"pattern matched a line that names a placeholder on purpose: {line}")
    for line in BAD_LINES:
        if not ASSIGNMENT.match(line):
            errors.append(f"pattern missed an assignment: {line}")

    for path in files():
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            errors.append(f"{path.relative_to(ROOT)}: not utf-8")
            continue
        for number, line in enumerate(text.splitlines(), start=1):
            if ASSIGNMENT.match(line):
                errors.append(f"{path.relative_to(ROOT)}:{number}: {line}")

    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("no placeholder secret assignments")
    return 0


if __name__ == "__main__":
    sys.exit(main())
