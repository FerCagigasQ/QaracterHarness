from __future__ import annotations

import re

from run.types import RunRequest


class BranchStrategy:
    def __init__(self, prefix: str = "apolo/run") -> None:
        self.prefix = prefix.strip("/")

    def branch_for(self, request: RunRequest) -> str:
        if request.branch_name:
            return request.branch_name
        slug = re.sub(r"[^a-z0-9]+", "-", request.plan_id.lower()).strip("-")
        return f"{self.prefix}/{slug or 'run'}"
