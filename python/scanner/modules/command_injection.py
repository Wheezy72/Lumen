from typing import Dict, List, Optional

from scanner.config import COMMAND_PARAM_NAMES
from scanner.templates import clone_template, iter_input_fields, send_template, set_input_field, template_to_url


COMMAND_PAYLOADS = [
    "127.0.0.1; echo LUMEN_CMD_TEST",
    "127.0.0.1 && echo LUMEN_CMD_TEST",
    "127.0.0.1 | echo LUMEN_CMD_TEST",
    "127.0.0.1 & echo LUMEN_CMD_TEST",
]


def check_command_injection_template(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    """Test likely command-style fields with harmless echo markers."""
    issues: List[Dict] = []
    fields = [
        (location, key)
        for location, key in iter_input_fields(template)
        if key.lower() in COMMAND_PARAM_NAMES
    ]

    for location, key in fields:
        for payload in COMMAND_PAYLOADS:
            test_template = clone_template(template)
            set_input_field(test_template, location, key, payload)
            method = str(test_template.get("method", "GET")).upper()
            test_url = template_to_url(test_template)

            try:
                resp = send_template(test_template, headers)
                body = resp.text
                if "LUMEN_CMD_TEST" in body and payload not in body:
                    issues.append({
                        "title": "Command injection",
                        "severity": "critical",
                        "description": (
                            f"Injecting a shell separator into field '{key}' caused command output "
                            "to appear in the response."
                        ),
                        "evidence": f"Method: {method} | Field: {key} | Payload: {payload} | URL: {test_url}",
                        "category": "command_injection",
                        "url": test_template.get("url"),
                        "method": method,
                        "parameter": key,
                        "payload": payload,
                        "confidence": "confirmed",
                    })
                    return issues
            except Exception:
                continue

    return issues
