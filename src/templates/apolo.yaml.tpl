# ${marker}
version: 1
project:
  name: "${repo_name}"
  profile: ".apolo/project-profile.json"
memory:
  root: "apolo-memory"
  facts: "apolo-memory/facts"
  decisions: "apolo-memory/decisions"
  handoffs: "apolo-memory/handoffs"
commands:
  lint:
${lint_commands_yaml}
  test:
${test_commands_yaml}
  build:
${build_commands_yaml}
gates:
  config: ".apolo/gates.yaml"
handoff:
  session: "session-handoff.md"
  quality: "quality-document.md"
