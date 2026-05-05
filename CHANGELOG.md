# Changelog

All notable APOLO-CLI packaging and runtime changes should be documented here.

## Unreleased

- Align APOLO 1.0 package/runtime direction around a TypeScript/Node.js-only npm runtime.
- Clarify that Python is optional for target-repository verification, source-checkout fixture tests, or future plugins.
- Strengthen package validation for docs/examples tarball contents and exclusion of Python runtime files.
- Add E2E fixture contracts for Node repositories, Python target repositories, repositories without tests, simulated dummy secret content, and fake agent binaries.

## Release entry checklist

Before cutting a release, update this file with:

- version and release date
- user-facing CLI changes
- packaging/runtime notes
- migration guidance, if any
- validation commands and CI status
