import socket
import ssl
from typing import Dict, List


def check_tls(hostname: str, port: int = 443) -> List[Dict]:
    """Open a TLS connection to the host and look for obvious SSL/TLS problems."""
    issues: List[Dict] = []
    try:
        ctx = ssl.create_default_context()
        ctx.check_hostname = True
        ctx.verify_mode = ssl.CERT_REQUIRED

        with socket.create_connection((hostname, port), timeout=8) as sock:
            with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
                cert = ssock.getpeercert()
                if not cert:
                    issues.append({
                        "title": "Missing SSL certificate",
                        "severity": "high",
                        "description": "No SSL certificate was presented by the server.",
                        "category": "ssl",
                    })
                proto = ssock.version()
                _WEAK_PROTOCOLS = {"TLSv1", "TLSv1.1"}
                if proto and proto in _WEAK_PROTOCOLS:
                    issues.append({
                        "title": f"Outdated TLS protocol in use ({proto})",
                        "severity": "medium",
                        "description": (
                            f"The server negotiated {proto}, which is deprecated and considered insecure. "
                            "TLS 1.3 is the recommended standard; TLS 1.2 is the minimum acceptable version. "
                            "TLS 1.0 and TLS 1.1 must be disabled."
                        ),
                        "category": "ssl",
                    })
    except Exception as e:
        issues.append({
            "title": "SSL/TLS handshake error",
            "severity": "medium",
            "description": str(e),
            "category": "ssl",
        })
    return issues
