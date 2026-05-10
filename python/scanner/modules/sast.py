import json
import os
import re
from typing import Dict, Iterable, List, Optional, Tuple

from ..config import (
    SAST_MAX_FILE_BYTES,
    SAST_MAX_FILES,
    SAST_MAX_FINDINGS_PER_RULE,
    SAST_MAX_TOTAL_BYTES,
    SAST_SKIP_DIRS,
    SAST_TEXT_EXTENSIONS,
)


# ── Secret patterns -----------------------------------------------------------
# Each rule keeps a tight regex plus a "marker" hint so we can describe the
# match without echoing the secret value back into the report verbatim.
SECRET_RULES: List[Dict] = [
    {
        "id": "aws_access_key",
        "title": "AWS access key ID",
        "severity": "high",
        "regex": re.compile(r"\b(AKIA|ASIA)[0-9A-Z]{16}\b"),
    },
    {
        "id": "aws_secret_key",
        "title": "AWS secret access key",
        "severity": "high",
        "regex": re.compile(
            r"(?i)aws(.{0,20})?(secret|sk)[^\n]{0,3}[:=]\s*['\"]?[A-Za-z0-9/+=]{40}['\"]?"
        ),
    },
    {
        "id": "github_token",
        "title": "GitHub token",
        "severity": "high",
        "regex": re.compile(r"\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}\b"),
    },
    {
        "id": "slack_token",
        "title": "Slack token",
        "severity": "medium",
        "regex": re.compile(r"\bxox[abprs]-[A-Za-z0-9-]{10,48}\b"),
    },
    {
        "id": "google_api_key",
        "title": "Google API key",
        "severity": "high",
        "regex": re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b"),
    },
    {
        "id": "stripe_secret",
        "title": "Stripe secret key",
        "severity": "high",
        "regex": re.compile(r"\bsk_(live|test)_[0-9a-zA-Z]{16,}\b"),
    },
    {
        "id": "private_key",
        "title": "Private key block",
        "severity": "critical",
        "regex": re.compile(
            r"-----BEGIN (?:RSA|EC|DSA|PGP|OPENSSH|ENCRYPTED|PRIVATE) PRIVATE KEY-----"
        ),
    },
    {
        "id": "jwt_token",
        "title": "JWT-like token",
        "severity": "medium",
        "regex": re.compile(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b"),
    },
    {
        "id": "env_assignment",
        "title": "Hard-coded credential in source",
        "severity": "medium",
        # Catches lines like API_KEY="abcd1234" or DB_PASSWORD = 'hunter2'.
        # Skips obvious placeholders (CHANGEME, REPLACE_ME, your_*, dummy/test).
        "regex": re.compile(
            r"(?im)^[ \t]*(?P<name>[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD))"
            r"\s*=\s*['\"](?P<value>[^'\"\n]{6,})['\"]"
        ),
        "value_filter": lambda value: not re.search(
            r"(?i)\b(changeme|change_me|replace[_-]?me|your[_-]|example|placeholder|dummy|todo|test|sample|<.*?>)\b",
            value,
        ),
    },
]


# ── Risky code pattern rules --------------------------------------------------
# We focus on patterns that are nearly always either insecure or worth a human
# review, while accepting some false positives for things like raw SQL strings.
RISKY_RULES: List[Dict] = [
    {
        "id": "python_eval",
        "title": "Use of eval()/exec() in Python",
        "severity": "high",
        "regex": re.compile(r"\b(eval|exec)\s*\("),
        "extensions": {".py"},
    },
    {
        "id": "python_pickle_load",
        "title": "Insecure deserialization with pickle.load",
        "severity": "high",
        "regex": re.compile(r"\bpickle\.(loads|load)\s*\("),
        "extensions": {".py"},
    },
    {
        "id": "python_yaml_load",
        "title": "Unsafe yaml.load() without Loader",
        "severity": "medium",
        "regex": re.compile(r"\byaml\.load\s*\(([^)]*)\)"),
        "extensions": {".py"},
        "value_filter": lambda value: "Loader=" not in value,
    },
    {
        "id": "python_subprocess_shell",
        "title": "subprocess called with shell=True",
        "severity": "high",
        "regex": re.compile(r"subprocess\.(call|run|Popen|check_output)\s*\([^)]*shell\s*=\s*True"),
        "extensions": {".py"},
    },
    {
        "id": "python_os_system",
        "title": "Use of os.system()",
        "severity": "medium",
        "regex": re.compile(r"\bos\.system\s*\("),
        "extensions": {".py"},
    },
    {
        "id": "node_child_process_exec",
        "title": "child_process.exec/execSync with dynamic input",
        "severity": "high",
        "regex": re.compile(r"\bchild_process\.(exec|execSync)\s*\("),
        "extensions": {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"},
    },
    {
        "id": "node_eval",
        "title": "Use of eval() in JavaScript",
        "severity": "high",
        "regex": re.compile(r"\beval\s*\("),
        "extensions": {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"},
    },
    {
        "id": "node_function_constructor",
        "title": "Dynamic Function() constructor",
        "severity": "medium",
        "regex": re.compile(r"\bnew\s+Function\s*\("),
        "extensions": {".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"},
    },
    {
        "id": "raw_sql_concat",
        "title": "Raw SQL built with string concatenation",
        "severity": "medium",
        # Looks for SELECT/INSERT/UPDATE/DELETE strings followed by + concat or
        # template-literal interpolation. Limited to source extensions where
        # this is meaningful to reduce noise on docs and configs.
        "regex": re.compile(
            r"""(?i)(['"`])\s*(select|insert\s+into|update|delete\s+from)\b[^'"`]*\1\s*"""
            r"""(\+|`\s*\$\{)"""
        ),
        "extensions": {".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".java", ".cs", ".php", ".rb", ".go"},
    },
    {
        "id": "java_runtime_exec",
        "title": "Java Runtime.exec() invocation",
        "severity": "high",
        "regex": re.compile(r"Runtime\.getRuntime\(\)\.exec\s*\("),
        "extensions": {".java", ".kt"},
    },
]


# ── Helpers -------------------------------------------------------------------


def _looks_binary(blob: bytes) -> bool:
    if b"\x00" in blob[:4096]:
        return True
    sample = blob[:4096]
    if not sample:
        return False
    text_chars = bytearray({7, 8, 9, 10, 12, 13, 27} | set(range(0x20, 0x100)) - {0x7F})
    nontext = sample.translate(None, text_chars)
    return len(nontext) / max(len(sample), 1) > 0.30


def _read_text_file(path: str) -> Optional[str]:
    try:
        with open(path, "rb") as fh:
            blob = fh.read(SAST_MAX_FILE_BYTES + 1)
    except OSError:
        return None

    if len(blob) > SAST_MAX_FILE_BYTES:
        return None
    if _looks_binary(blob):
        return None
    try:
        return blob.decode("utf-8")
    except UnicodeDecodeError:
        try:
            return blob.decode("latin-1")
        except Exception:
            return None


def _walk_source_files(root: str) -> Iterable[str]:
    for current_dir, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = [d for d in dirs if d not in SAST_SKIP_DIRS and not d.startswith(".")]
        for name in files:
            yield os.path.join(current_dir, name)


def _is_scannable_file(path: str) -> bool:
    name = os.path.basename(path)
    if name.startswith(".env") or name in {"Dockerfile", "Makefile"}:
        return True
    ext = os.path.splitext(name)[1].lower()
    return ext in SAST_TEXT_EXTENSIONS


def _line_for_offset(text: str, offset: int) -> Tuple[int, str]:
    line_no = text.count("\n", 0, offset) + 1
    line_start = text.rfind("\n", 0, offset) + 1
    line_end = text.find("\n", offset)
    if line_end == -1:
        line_end = len(text)
    return line_no, text[line_start:line_end].strip()


def _truncate(value: str, limit: int = 160) -> str:
    value = value.replace("\n", " ").strip()
    return value if len(value) <= limit else value[: limit - 1] + "…"


# ── Detection passes ----------------------------------------------------------


def _scan_secrets(rel_path: str, ext: str, text: str, counts: Dict[str, int]) -> List[Dict]:
    issues: List[Dict] = []
    for rule in SECRET_RULES:
        if counts[rule["id"]] >= SAST_MAX_FINDINGS_PER_RULE:
            continue
        for match in rule["regex"].finditer(text):
            value = match.group(0)
            if "value_filter" in rule:
                inner = match.groupdict().get("value", value)
                if not rule["value_filter"](inner):
                    continue
            line_no, snippet = _line_for_offset(text, match.start())
            issues.append({
                "title": f"{rule['title']} found in source",
                "severity": rule["severity"],
                "category": "secrets",
                "description": (
                    "A value matching a known secret pattern is committed in source. "
                    "Rotate the credential and move it into a secrets manager or untracked "
                    "environment file."
                ),
                "evidence": f"{rel_path}:{line_no} | {_truncate(snippet)}",
                "url": rel_path,
                "method": "SAST",
                "parameter": rule["id"],
                "confidence": "potential",
            })
            counts[rule["id"]] += 1
            if counts[rule["id"]] >= SAST_MAX_FINDINGS_PER_RULE:
                break
    return issues


def _scan_risky_patterns(rel_path: str, ext: str, text: str, counts: Dict[str, int]) -> List[Dict]:
    issues: List[Dict] = []
    for rule in RISKY_RULES:
        if rule.get("extensions") and ext not in rule["extensions"]:
            continue
        if counts[rule["id"]] >= SAST_MAX_FINDINGS_PER_RULE:
            continue
        for match in rule["regex"].finditer(text):
            value = match.group(0)
            if "value_filter" in rule and not rule["value_filter"](value):
                continue
            line_no, snippet = _line_for_offset(text, match.start())
            issues.append({
                "title": rule["title"],
                "severity": rule["severity"],
                "category": "risky_code",
                "description": (
                    "This pattern is commonly associated with code-injection, command-injection, "
                    "or unsafe deserialization issues. Confirm whether the input flowing into the "
                    "call is trusted or properly validated."
                ),
                "evidence": f"{rel_path}:{line_no} | {_truncate(snippet)}",
                "url": rel_path,
                "method": "SAST",
                "parameter": rule["id"],
                "confidence": "potential",
            })
            counts[rule["id"]] += 1
            if counts[rule["id"]] >= SAST_MAX_FINDINGS_PER_RULE:
                break
    return issues


# ── Dependency hygiene --------------------------------------------------------


def _check_dependency_hygiene(root: str) -> List[Dict]:
    issues: List[Dict] = []

    def add(title: str, severity: str, evidence: str, rule_id: str) -> None:
        issues.append({
            "title": title,
            "severity": severity,
            "category": "dependency",
            "description": (
                "Dependency configuration affects the security posture of the project. "
                "Pin versions, commit lockfiles, and avoid wildcard ranges so installs are "
                "reproducible and reviewable."
            ),
            "evidence": evidence,
            "url": evidence.split(" | ", 1)[0],
            "method": "SAST",
            "parameter": rule_id,
            "confidence": "potential",
        })

    package_json = os.path.join(root, "package.json")
    if os.path.isfile(package_json):
        rel = os.path.relpath(package_json, root)
        try:
            with open(package_json, "r", encoding="utf-8") as fh:
                manifest = json.load(fh)
        except Exception:
            manifest = None

        has_lock = any(
            os.path.isfile(os.path.join(root, lock))
            for lock in ("package-lock.json", "pnpm-lock.yaml", "yarn.lock")
        )
        if not has_lock:
            add(
                "Missing JavaScript lockfile",
                "medium",
                f"{rel} | No package-lock.json/pnpm-lock.yaml/yarn.lock found",
                "missing_js_lockfile",
            )

        if isinstance(manifest, dict):
            for section in ("dependencies", "devDependencies"):
                deps = manifest.get(section) or {}
                wild = [
                    f"{name}@{spec}"
                    for name, spec in deps.items()
                    if isinstance(spec, str) and spec.strip() in {"*", "latest"}
                ]
                if wild:
                    add(
                        f"Wildcard dependency version in {section}",
                        "low",
                        f"{rel} | {', '.join(wild[:5])}",
                        "js_wildcard_version",
                    )

    requirements = os.path.join(root, "requirements.txt")
    if os.path.isfile(requirements):
        rel = os.path.relpath(requirements, root)
        try:
            with open(requirements, "r", encoding="utf-8") as fh:
                lines = fh.read().splitlines()
        except Exception:
            lines = []
        unpinned = [
            line.strip()
            for line in lines
            if line.strip() and not line.strip().startswith("#") and "==" not in line
        ]
        if unpinned:
            add(
                "Unpinned Python requirements",
                "low",
                f"{rel} | {len(unpinned)} package(s) without == version pin",
                "py_unpinned_requirements",
            )

    return issues


# ── Public entrypoint ---------------------------------------------------------


def check_sast_source(source_path: Optional[str], **_: Dict) -> List[Dict]:
    """Lightweight static analysis for secrets, risky code patterns, and
    dependency hygiene. Operates on a local filesystem path supplied via the
    public API or worker job. No network calls are made here.
    """

    issues: List[Dict] = []
    if not source_path:
        return issues
    root = os.path.abspath(source_path)
    if not os.path.isdir(root):
        return [{
            "title": "SAST source path not found",
            "severity": "low",
            "category": "sast",
            "description": "The configured source path could not be opened for static analysis.",
            "evidence": f"sourcePath: {source_path}",
            "confidence": "potential",
        }]

    secret_counts = {rule["id"]: 0 for rule in SECRET_RULES}
    risky_counts = {rule["id"]: 0 for rule in RISKY_RULES}
    files_scanned = 0
    bytes_scanned = 0

    for path in _walk_source_files(root):
        if files_scanned >= SAST_MAX_FILES or bytes_scanned >= SAST_MAX_TOTAL_BYTES:
            break
        if not _is_scannable_file(path):
            continue

        text = _read_text_file(path)
        if text is None:
            continue

        rel_path = os.path.relpath(path, root)
        ext = os.path.splitext(path)[1].lower()
        files_scanned += 1
        bytes_scanned += len(text)

        issues.extend(_scan_secrets(rel_path, ext, text, secret_counts))
        issues.extend(_scan_risky_patterns(rel_path, ext, text, risky_counts))

    issues.extend(_check_dependency_hygiene(root))

    issues.append({
        "title": "SAST coverage summary",
        "severity": "info",
        "category": "sast",
        "description": (
            f"Lightweight static analysis inspected {files_scanned} text file(s) "
            f"({bytes_scanned // 1024} KB) under {os.path.basename(root) or root}."
        ),
        "evidence": (
            f"Source: {root} | Files scanned: {files_scanned} | "
            f"Bytes scanned: {bytes_scanned} | Max files: {SAST_MAX_FILES} | "
            f"Max bytes: {SAST_MAX_TOTAL_BYTES}"
        ),
    })

    return issues
