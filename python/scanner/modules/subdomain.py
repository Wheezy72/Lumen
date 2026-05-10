from typing import Dict, List

import dns.resolver


def discover_subdomains(hostname: str) -> List[Dict]:
    """Resolve a small set of common subdomains for the host. Skips IPs and localhost."""
    import ipaddress
    issues: List[Dict] = []

    try:
        ipaddress.ip_address(hostname)
        return issues
    except ValueError:
        pass

    if hostname in ("localhost",) or hostname.endswith(".local"):
        return issues

    try:
        common = ["www", "api", "dev", "staging", "test", "mail"]
        for sub in common:
            fqdn = f"{sub}.{hostname}"
            try:
                answers = dns.resolver.resolve(fqdn, "A")
                ips = [answer.to_text() for answer in answers]
                issues.append({
                    "title": f"Subdomain found: {fqdn}",
                    "severity": "low",
                    "description": f"{fqdn} resolves to {', '.join(ips)}",
                    "category": "subdomain",
                })
            except Exception:
                continue
    except Exception as e:
        issues.append({
            "title": "Subdomain enumeration error",
            "severity": "low",
            "description": str(e),
            "category": "subdomain",
        })
    return issues
