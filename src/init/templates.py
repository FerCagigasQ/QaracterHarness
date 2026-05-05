from __future__ import annotations

from importlib import resources
from string import Template


class TemplateRenderer:
    def render(self, template_name: str, variables: dict[str, str]) -> str:
        template = resources.files("templates").joinpath(template_name).read_text(encoding="utf-8")
        return Template(template).safe_substitute(variables)
