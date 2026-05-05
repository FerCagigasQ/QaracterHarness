<!-- ${marker} -->
# Quality Document

## Detected validation

### Lint
${lint_commands_md}

### Test
${test_commands_md}

### Build
${build_commands_md}

## Quality gate policy

- Run the detected commands before handing off code changes.
- If a command is missing, document why it is not available.
- Keep `.apolo/gates.yaml` aligned with repository tooling.
