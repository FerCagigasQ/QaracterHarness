from __future__ import annotations

import json

from .models import RepoScan, StackDetection


def detect_stack(scan: RepoScan) -> StackDetection:
    languages = _detect_languages(scan)
    package_managers = _detect_package_managers(scan)
    frameworks = _detect_frameworks(scan)
    ci = _detect_ci(scan)
    tests = _detect_tests(scan)
    commands = _detect_commands(scan, languages)

    return StackDetection(
        languages=languages,
        frameworks=frameworks,
        package_managers=package_managers,
        test_commands=commands["test"],
        lint_commands=commands["lint"],
        build_commands=commands["build"],
        ci_providers=ci,
        tests_present=tests,
        minimal_test_kind=_minimal_test_kind(languages),
    )


def _detect_languages(scan: RepoScan) -> list[str]:
    markers: list[tuple[str, bool]] = [
        ("python", scan.has_any("pyproject.toml", "setup.py", "requirements.txt", "*.py")),
        ("javascript", scan.has_any("package.json", "*.js", "*.jsx", "*.mjs", "*.cjs")),
        ("typescript", scan.has_any("tsconfig.json", "*.ts", "*.tsx")),
        ("rust", scan.has_any("Cargo.toml", "*.rs")),
        ("go", scan.has_any("go.mod", "*.go")),
        ("java", scan.has_any("pom.xml", "build.gradle", "build.gradle.kts", "*.java")),
        ("dotnet", scan.has_any("*.csproj", "*.fsproj", "*.sln")),
        ("ruby", scan.has_any("Gemfile", "*.rb")),
        ("php", scan.has_any("composer.json", "*.php")),
    ]
    return [name for name, present in markers if present]


def _detect_package_managers(scan: RepoScan) -> list[str]:
    managers: list[tuple[str, bool]] = [
        ("npm", scan.has("package-lock.json") or scan.has("package.json")),
        ("pnpm", scan.has("pnpm-lock.yaml")),
        ("yarn", scan.has("yarn.lock")),
        ("pip", scan.has("requirements.txt")),
        ("poetry", scan.has("poetry.lock")),
        ("uv", scan.has("uv.lock")),
        ("cargo", scan.has("Cargo.toml")),
        ("go", scan.has("go.mod")),
        ("maven", scan.has("pom.xml")),
        ("gradle", scan.has_any("build.gradle", "build.gradle.kts")),
        ("dotnet", scan.has_any("*.csproj", "*.fsproj", "*.sln")),
        ("bundler", scan.has("Gemfile")),
        ("composer", scan.has("composer.json")),
    ]
    return [name for name, present in managers if present]


def _detect_frameworks(scan: RepoScan) -> list[str]:
    frameworks: set[str] = set()
    package = _read_package_json(scan)
    dependencies = set(package.get("dependencies", {})) | set(package.get("devDependencies", {}))
    dependency_map = {
        "react": "react",
        "next": "nextjs",
        "vite": "vite",
        "vue": "vue",
        "svelte": "svelte",
        "express": "express",
        "fastify": "fastify",
        "jest": "jest",
        "vitest": "vitest",
        "playwright": "playwright",
    }
    for package_name, framework in dependency_map.items():
        if package_name in dependencies:
            frameworks.add(framework)

    pyproject = scan.read_text("pyproject.toml").lower()
    requirements = scan.read_text("requirements.txt").lower()
    python_text = f"{pyproject}\n{requirements}"
    for marker, framework in [
        ("django", "django"),
        ("fastapi", "fastapi"),
        ("flask", "flask"),
        ("pytest", "pytest"),
        ("ruff", "ruff"),
    ]:
        if marker in python_text:
            frameworks.add(framework)

    if scan.has("Cargo.toml"):
        cargo = scan.read_text("Cargo.toml").lower()
        for marker, framework in [("axum", "axum"), ("actix", "actix"), ("rocket", "rocket")]:
            if marker in cargo:
                frameworks.add(framework)

    return sorted(frameworks)


def _detect_ci(scan: RepoScan) -> list[str]:
    providers: list[str] = []
    if scan.has_prefix(".github/workflows/"):
        providers.append("github-actions")
    if scan.has(".gitlab-ci.yml"):
        providers.append("gitlab-ci")
    if scan.has("azure-pipelines.yml"):
        providers.append("azure-pipelines")
    if scan.has("bitbucket-pipelines.yml"):
        providers.append("bitbucket-pipelines")
    if scan.has("Jenkinsfile"):
        providers.append("jenkins")
    return providers


def _detect_tests(scan: RepoScan) -> bool:
    if scan.has_any("tests/**", "test/**", "__tests__/**", "spec/**"):
        return True
    test_markers = (
        "_test.go",
        ".test.js",
        ".test.ts",
        ".spec.js",
        ".spec.ts",
        "_test.py",
        "test_",
        "Test.java",
    )
    return any(path.name.startswith("test_") or path.name.endswith(test_markers) for path in scan.files)


def _detect_commands(scan: RepoScan, languages: list[str]) -> dict[str, list[str]]:
    commands: dict[str, list[str]] = {"test": [], "lint": [], "build": []}
    package = _read_package_json(scan)
    scripts = package.get("scripts", {})
    if isinstance(scripts, dict):
        package_runner = _node_runner(scan)
        for script_name, bucket in [
            ("test", "test"),
            ("lint", "lint"),
            ("build", "build"),
            ("typecheck", "lint"),
        ]:
            if script_name in scripts:
                commands[bucket].append(f"{package_runner} run {script_name}")

    if "python" in languages:
        pyproject = scan.read_text("pyproject.toml").lower()
        if "pytest" in pyproject or scan.has_any("pytest.ini", "tox.ini"):
            commands["test"].append("python -m pytest")
        else:
            commands["test"].append("python -m unittest discover")
        if "ruff" in pyproject:
            commands["lint"].append("python -m ruff check .")
        if scan.has("pyproject.toml"):
            commands["build"].append("python -m build")

    if "rust" in languages:
        commands["test"].append("cargo test")
        commands["lint"].append("cargo clippy --all-targets --all-features")
        commands["build"].append("cargo build")

    if "go" in languages:
        commands["test"].append("go test ./...")
        commands["lint"].append("go vet ./...")
        commands["build"].append("go build ./...")

    if "java" in languages:
        if scan.has("pom.xml"):
            commands["test"].append("mvn test")
            commands["build"].append("mvn package")
        if scan.has_any("build.gradle", "build.gradle.kts"):
            commands["test"].append("./gradlew test")
            commands["build"].append("./gradlew build")

    if "dotnet" in languages:
        commands["test"].append("dotnet test")
        commands["build"].append("dotnet build")

    return {key: _dedupe(values) for key, values in commands.items()}


def _minimal_test_kind(languages: list[str]) -> str:
    if "python" in languages:
        return "python"
    if "typescript" in languages or "javascript" in languages:
        return "node"
    if "rust" in languages:
        return "rust"
    if "go" in languages:
        return "go"
    return "shell"


def _read_package_json(scan: RepoScan) -> dict[str, object]:
    text = scan.read_text("package.json")
    if not text:
        return {}
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _node_runner(scan: RepoScan) -> str:
    if scan.has("pnpm-lock.yaml"):
        return "pnpm"
    if scan.has("yarn.lock"):
        return "yarn"
    return "npm"


def _dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        if value not in result:
            result.append(value)
    return result
