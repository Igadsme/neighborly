#!/usr/bin/env python3
"""Fail unless Compose ports are loopback and staging images are pinned.

Renders `docker compose config` and `docker compose --profile staging config`.
Every published port must bind 127.0.0.1. Staging-profile images must have a
tag other than latest. The minio service image must equal the storage job's
S3_IMAGE, which is rustfs/rustfs:1.0.1.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_S3_IMAGE = "rustfs/rustfs:1.0.1"
S3_IMAGE_LINE = re.compile(r"^[ \t]*S3_IMAGE:[ \t]*(\S+)[ \t]*$", re.MULTILINE)


def compose_base() -> list[str]:
    docker = shutil.which("docker")
    if docker:
        probe = subprocess.run(
            [docker, "compose", "version"],
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0:
            return [docker, "compose"]
    for candidate in ("docker-compose", "/tmp/docker-compose"):
        path = shutil.which(candidate)
        if path is None and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
            path = candidate
        if path:
            return [path]
    print("docker compose is not available", file=sys.stderr)
    return []


def image_tag(image: str) -> str | None:
    without_digest = image.split("@", 1)[0]
    slash = without_digest.rfind("/")
    colon = without_digest.rfind(":")
    if colon <= slash:
        return None
    tag = without_digest[colon + 1 :]
    return tag or None


def render(base: list[str], profile: str | None) -> dict:
    command = [*base]
    if profile:
        command.extend(["--profile", profile])
    command.extend(["config", "--format", "json"])
    completed = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if completed.returncode != 0:
        sys.stderr.write(completed.stderr)
        raise SystemExit(completed.returncode or 1)
    return json.loads(completed.stdout)


def check_ports(document: dict, label: str) -> list[str]:
    errors: list[str] = []
    for name, service in document.get("services", {}).items():
        for port in service.get("ports") or []:
            if isinstance(port, str):
                host_ip = port.split(":", 1)[0]
                published = port
            else:
                host_ip = port.get("host_ip")
                published = port.get("published")
            if host_ip != "127.0.0.1":
                errors.append(
                    f"{label}: {name} publishes {published} on {host_ip!r}, expected 127.0.0.1"
                )
    return errors


def storage_image() -> str:
    text = (ROOT / ".github/workflows/ci.yml").read_text(encoding="utf-8")
    found = S3_IMAGE_LINE.findall(text)
    if found != [EXPECTED_S3_IMAGE]:
        raise SystemExit(
            f"storage job S3_IMAGE is {found!r}, expected {[EXPECTED_S3_IMAGE]!r}"
        )
    return found[0]


def check_staging_images(document: dict, expected: str) -> list[str]:
    errors: list[str] = []
    services = document.get("services", {})
    if "minio" not in services:
        return ["staging config has no minio service"]
    for name, service in services.items():
        if "staging" not in (service.get("profiles") or []):
            continue
        image = service.get("image")
        if not image:
            errors.append(f"staging: {name} has no image tag")
            continue
        tag = image_tag(image)
        if tag is None:
            errors.append(f"staging: {name} image {image} is untagged")
        elif tag == "latest":
            errors.append(f"staging: {name} image {image} uses :latest")
        if name == "minio" and image != expected:
            errors.append(f"staging: minio image {image} != storage job S3_IMAGE {expected}")
    return errors


def main() -> int:
    base = compose_base()
    if not base:
        return 1
    expected = storage_image()
    env_file = ROOT / ".env.staging"
    created = False
    if not env_file.exists():
        shutil.copyfile(ROOT / "env.staging.example", env_file)
        created = True
    try:
        dev = render(base, None)
        staging = render(base, "staging")
    finally:
        if created:
            env_file.unlink(missing_ok=True)
    errors = [
        *check_ports(dev, "dev"),
        *check_ports(staging, "staging"),
        *check_staging_images(staging, expected),
    ]
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print(f"ports are 127.0.0.1 and minio is {expected}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
