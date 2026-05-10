from typing import Dict, List, Optional

from scanner.templates import clone_template, iter_input_fields, make_get_template, send_template, set_input_field, template_to_url


def check_xss_template(template: Dict, headers: Optional[Dict] = None) -> List[Dict]:
    """Try to reflect a harmless script tag via every discovered input field."""
    issues: List[Dict] = []
    probe = "<script>alert(1)</script>"

    try:
        fields = iter_input_fields(template)
        if not fields:
            return issues

        for location, key in fields:
            test_template = clone_template(template)
            set_input_field(test_template, location, key, probe)
            test_url = template_to_url(test_template)
            try:
                resp = send_template(test_template, headers)
                import html
                decoded = html.unescape(resp.text)
                if probe in resp.text or probe in decoded:
                    method = str(test_template.get("method", "GET")).upper()
                    issues.append({
                        "title": "Reflected XSS",
                        "severity": "critical",
                        "description": (
                            f"Script tag injected into field '{key}' was reflected unescaped in the response, "
                            "indicating a Reflected Cross-Site Scripting vulnerability."
                        ),
                        "evidence": f"Method: {method} | Field: {key} | URL: {test_url}",
                        "category": "xss",
                        "url": test_template.get("url"),
                        "method": method,
                        "parameter": key,
                        "payload": probe,
                        "confidence": "confirmed",
                    })
                    break
            except Exception:
                continue

    except Exception as e:
        issues.append({
            "title": "XSS scan error",
            "severity": "low",
            "description": str(e),
            "category": "xss",
        })

    return issues


def check_xss(url: str, headers: Optional[Dict] = None) -> List[Dict]:
    return check_xss_template(make_get_template(url, source="direct"), headers)
