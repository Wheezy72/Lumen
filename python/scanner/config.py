import os
import re


def env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


# Set LUMEN_MAX_CRAWL_PAGES=0 to remove the page cap for local/lab scans.
MAX_CRAWL_PAGES = env_int("LUMEN_MAX_CRAWL_PAGES", 30)
MAX_CRAWL_DEPTH = env_int("LUMEN_MAX_CRAWL_DEPTH", 2)
REQUEST_TIMEOUT = env_int("LUMEN_REQUEST_TIMEOUT", 8)
MAX_SCRIPT_FETCHES = env_int("LUMEN_MAX_SCRIPT_FETCHES", 8)
BROWSER_DISCOVERY_ENABLED = os.getenv("LUMEN_BROWSER_DISCOVERY", "auto").lower()
BROWSER_DISCOVERY_TIMEOUT_MS = env_int("LUMEN_BROWSER_DISCOVERY_TIMEOUT_MS", 12000)
BROWSER_DISCOVERY_MAX_REQUESTS = env_int("LUMEN_BROWSER_DISCOVERY_MAX_REQUESTS", 40)
BROWSER_MAX_INTERACTIONS = env_int("LUMEN_BROWSER_MAX_INTERACTIONS", 12)
BROWSER_INTERACTION_WAIT_MS = env_int("LUMEN_BROWSER_INTERACTION_WAIT_MS", 700)

# Substrings used to filter clickable element labels during browser discovery.
# We deliberately keep allow-list scoped to navigation-style verbs so we never
# trigger destructive actions even on misconfigured test apps.
BROWSER_SAFE_LABEL_HINTS = {
    "menu", "nav", "search", "view", "details", "profile", "account",
    "products", "orders", "more", "next", "open", "browse", "explore",
    "dashboard", "feed", "list", "filter", "sort", "tab",
}

BROWSER_BLOCKED_LABEL_HINTS = {
    "delete", "remove", "destroy", "drop", "wipe", "purge",
    "pay", "payment", "checkout", "purchase", "buy", "order now",
    "confirm", "submit", "save", "update", "apply", "send",
    "logout", "log out", "sign out", "deactivate",
    "import", "export", "transfer",
}

STATIC_EXTENSIONS = (
    ".css", ".js", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".pdf", ".zip", ".tar", ".gz",
    ".mp4", ".mp3", ".avi", ".mov",
)

REDIRECT_PARAM_NAMES = {
    "next", "url", "redirect", "redirect_url", "redirect_uri", "return",
    "return_url", "returnurl", "continue", "dest", "destination", "callback",
}

COMMAND_PARAM_NAMES = {
    "ip", "host", "hostname", "domain", "target", "cmd", "command", "ping",
    "query", "url", "address",
}

CSRF_TOKEN_NAMES = {
    "csrf", "_csrf", "csrf_token", "token", "nonce", "authenticity_token",
    "__requestverificationtoken",
}

ORIGIN_LEVEL_MODULES = {"tls", "exposure", "subdomain"}

# ── Lightweight local SAST -----------------------------------------------------
# These caps keep SAST scans bounded so a misconfigured run never tries to read
# an entire repository's worth of vendored dependencies into memory.
SAST_MAX_FILE_BYTES = env_int("LUMEN_SAST_MAX_FILE_BYTES", 1_000_000)        # 1 MB per file
SAST_MAX_TOTAL_BYTES = env_int("LUMEN_SAST_MAX_TOTAL_BYTES", 50_000_000)     # 50 MB total
SAST_MAX_FILES = env_int("LUMEN_SAST_MAX_FILES", 5_000)
SAST_MAX_FINDINGS_PER_RULE = env_int("LUMEN_SAST_MAX_FINDINGS_PER_RULE", 20)

# Directories that are never useful to scan and are skipped wholesale.
SAST_SKIP_DIRS = {
    ".git", ".hg", ".svn",
    "node_modules", "bower_components", "vendor",
    ".venv", "venv", "env", "ENV", "__pycache__",
    "dist", "build", "out", "coverage", ".next", ".nuxt",
    ".cache", ".parcel-cache", ".turbo",
    ".idea", ".vscode",
    "site-packages",
}

# Only file extensions in this set are inspected. Everything else is treated as
# binary/uninteresting so the scanner stays predictable. ".env" is matched by
# filename rather than extension elsewhere.
SAST_TEXT_EXTENSIONS = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
    ".java", ".kt", ".go", ".rb", ".php", ".cs", ".rs",
    ".sh", ".bash", ".zsh",
    ".yml", ".yaml", ".toml", ".ini", ".cfg", ".conf",
    ".json", ".xml", ".env", ".properties",
    ".html", ".vue", ".svelte",
    ".sql",
    ".md", ".txt",
}

API_PATH_RE = re.compile(
    r"""["'`](?P<path>/(?:api|rest|graphql|v1|v2|v3|auth|users|user|admin|account|profile|products|orders|cart|basket|search|login|logout|feedback|upload)[A-Za-z0-9_./?=&%:-]*)["'`]""",
    re.IGNORECASE,
)
