from __future__ import annotations

import argparse
import json
from pathlib import Path

from .detector import detect_stack
from .generator import build_harness_plan
from .handoff import build_handoff_summary
from .pr_hooks import build_pull_request_handoff
from .scanner import scan_repo
from .writer import apply_write_plan, summarize_write_plan


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="apolo", description="APOLO CLI")
    subparsers = parser.add_subparsers(dest="command")

    init_parser = subparsers.add_parser("init", help="Generate an APOLO harness for a repository")
    init_parser.add_argument("--repo", default=".", help="Repository root to initialize")
    init_parser.add_argument("--dry-run", action="store_true", help="Show planned changes without writing")
    init_parser.add_argument("--force", action="store_true", help="Overwrite APOLO-managed files")
    init_parser.add_argument("--json", action="store_true", help="Print a JSON result")

    return parser


def run_init(repo: str, dry_run: bool, force: bool, as_json: bool) -> int:
    repo_root = Path(repo).expanduser().resolve()
    scan = scan_repo(repo_root)
    detection = detect_stack(scan)
    handoff = build_handoff_summary(repo_root, detection)
    plan = build_harness_plan(scan, detection, handoff)
    summary = summarize_write_plan(plan, force=force)

    if dry_run:
        result = {
            "mode": "dry-run",
            "repo": str(repo_root),
            "summary": summary.to_dict(),
            "git_handoff": handoff.to_dict(),
        }
    else:
        write_result = apply_write_plan(plan, force=force)
        result = {
            "mode": "write",
            "repo": str(repo_root),
            "summary": write_result.to_dict(),
            "git_handoff": handoff.to_dict(),
            "pull_request_handoff": build_pull_request_handoff(detection, write_result).to_dict(),
        }

    if as_json:
        print(json.dumps(result, indent=2, sort_keys=True))
    else:
        _print_text_result(result)
    return 1 if result["summary"].get("conflicts") else 0


def _print_text_result(result: dict[str, object]) -> None:
    summary = result["summary"]
    if not isinstance(summary, dict):
        raise TypeError("summary must be a dictionary")

    print(f"APOLO init {result['mode']} for {result['repo']}")
    for key in ("creates", "updates", "skips", "conflicts"):
        values = summary.get(key, [])
        if values:
            print(f"{key}:")
            for value in values:
                print(f"  - {value}")

    if summary.get("diff"):
        print("\nDiff summary:")
        print(summary["diff"])


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "init":
        return run_init(args.repo, dry_run=args.dry_run, force=args.force, as_json=args.json)

    parser.print_help()
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
