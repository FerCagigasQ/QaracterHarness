# CLI integration harness

The Python harness is intentionally dependency-free so it can run on Windows, macOS, and Linux with the standard library.

## Fixture-only validation

```bash
python -m unittest discover -s test/harness -p "test_*.py"
```

## Real CLI validation

When a runtime implementation is available, point `APOLO_BIN` at it:

```bash
APOLO_BIN=/absolute/path/to/apolo python -m unittest discover -s test/harness -p "test_*.py"
```

The helper copies `test/fixtures/minimal-project` into a temporary workspace before running commands.
