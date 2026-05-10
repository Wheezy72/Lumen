from typing import Dict, List, Optional

from bs4 import BeautifulSoup

from scanner.templates import clone_template, iter_input_fields, make_get_template, send_template, set_input_field, template_to_url


_SQLI_PATTERNS = [
    "you have an error in your sql syntax",
    "warning: mysql",
    "unclosed quotation mark",
    "quoted string not properly terminated",
    "pg_query",
    "ora-",
    "sqlite_",
    "syntax error",
    "sql syntax",
    "mysql_fetch",
    "mysqli_",
    "sqlstate",
    "division by zero",
    "supplied argument is not a valid mysql",
    "valid mysql result",
    "unexpected token",
    "unterminated string",
]

_SQLI_PAYLOADS = [
    "'",
    "' OR '1'='1",
    "' OR '1'='1' --",
    "1 AND 1=2",
]


def check_sql_injection_template(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    """Inject SQL payloads into every discovered input field and look for error messages."""
    issues: List[Dict] = []
    try:
        fields = iter_input_fields(template)
        if not fields:
            return issues

        for location, key in fields:
            for payload in _SQLI_PAYLOADS:
                test_template = clone_template(template)
                set_input_field(test_template, location, key, payload)
                test_url = template_to_url(test_template)
                try:
                    resp = send_template(test_template, headers)
                    soup = BeautifulSoup(resp.text, "lxml")
                    body = soup.get_text(" ", strip=True).lower()
                    matched = next((p for p in _SQLI_PATTERNS if p in body), None)
                    if matched:
                        method = str(test_template.get("method", "GET")).upper()
                        issues.append({
                            "title": "SQL Injection",
                            "severity": "critical",
                            "description": (
                                f"Injecting `{payload}` into field '{key}' triggered a database error, "
                                "confirming SQL Injection."
                            ),
                            "evidence": (
                                f"Method: {method} | Field: {key} | Payload: {payload} | "
                                f"Match: '{matched}' | URL: {test_url}"
                            ),
                            "category": "sqli",
                            "url": test_template.get("url"),
                            "method": method,
                            "parameter": key,
                            "payload": payload,
                            "confidence": "confirmed",
                        })
                        return issues
                except Exception:
                    continue

    except Exception as e:
        issues.append({
            "title": "SQL injection scan error",
            "severity": "low",
            "description": str(e),
            "category": "sqli",
        })
    return issues


def check_sql_injection(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    return check_sql_injection_template(make_get_template(url, source="direct"), headers)
