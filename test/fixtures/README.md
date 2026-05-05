# Integration fixtures

These fixtures define a generic APOLO workspace contract for implementation PRs.

Fixture policies:

- Claude coordinator
- Qwen through Ollama for local model workflows
- max 5 agents
- human approval always
- no credentials or private endpoints
- product 1.0 fixtures must use Node/TypeScript as the mandatory runtime; Python may appear only as optional legacy/reference metadata

Use these fixtures from tests instead of creating command-specific sample data in feature modules.
