# ${marker}
version: 1
required:
  - name: lint
    commands:
${lint_commands_gates_yaml}
    allow_empty: true
  - name: test
    commands:
${test_commands_gates_yaml}
    allow_empty: true
  - name: build
    commands:
${build_commands_gates_yaml}
    allow_empty: true
handoff:
  require_clean_git_status: true
  require_session_handoff_update: true
