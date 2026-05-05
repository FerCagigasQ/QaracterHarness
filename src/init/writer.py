from __future__ import annotations

import difflib
import os
from pathlib import Path

from .models import GeneratedFile, WritePlan, WriteSummary


def summarize_write_plan(plan: WritePlan, force: bool = False) -> WriteSummary:
    creates: list[str] = []
    updates: list[str] = []
    skips: list[str] = []
    conflicts: list[str] = []
    diff_chunks: list[str] = []

    for generated in plan.files:
        status = _classify(plan.repo_root, generated, plan.marker, force=force)
        if status == "create":
            creates.append(generated.relative_path)
            diff_chunks.append(_diff("", generated.content, generated.relative_path))
        elif status == "update":
            updates.append(generated.relative_path)
            existing = _read(plan.repo_root / generated.relative_path)
            diff_chunks.append(_diff(existing, generated.content, generated.relative_path))
        elif status == "skip":
            skips.append(generated.relative_path)
        else:
            conflicts.append(generated.relative_path)

    return WriteSummary(creates=creates, updates=updates, skips=skips, conflicts=conflicts, diff="\n".join(diff_chunks))


def apply_write_plan(plan: WritePlan, force: bool = False) -> WriteSummary:
    summary = summarize_write_plan(plan, force=force)
    if summary.conflicts:
        return summary

    writable = set(summary.creates + summary.updates)
    for generated in plan.files:
        if generated.relative_path not in writable:
            continue
        target = plan.repo_root / generated.relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(generated.content, encoding="utf-8")
        if generated.executable:
            _make_executable(target)
    return summary


def _classify(repo_root: Path, generated: GeneratedFile, marker: str, force: bool) -> str:
    target = repo_root / generated.relative_path
    if not target.exists():
        return "create"
    if not target.is_file():
        return "conflict"

    existing = _read(target)
    if existing == generated.content:
        return "skip"
    if force or marker in existing:
        return "update"
    return "conflict"


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="ignore")


def _diff(existing: str, generated: str, relative_path: str) -> str:
    return "".join(
        difflib.unified_diff(
            existing.splitlines(keepends=True),
            generated.splitlines(keepends=True),
            fromfile=f"a/{relative_path}",
            tofile=f"b/{relative_path}",
        )
    )


def _make_executable(target: Path) -> None:
    mode = target.stat().st_mode
    target.chmod(mode | os.XUSR | os.XGRP | os.XOTH)
