import ipaddress
import socket
import urllib.parse
from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple


class URLValidationError(ValueError):
    pass


class ExternalTargetNotAllowedError(URLValidationError):
    pass


class BlockedIPAddressError(URLValidationError):
    pass


ALLOWED_SCHEMES = {"http", "https"}

ALWAYS_BLOCKED_IPV4 = [
    ipaddress.IPv4Network("0.0.0.0/8"),
    ipaddress.IPv4Network("127.0.0.0/8"),
    ipaddress.IPv4Network("169.254.0.0/16"),
    ipaddress.IPv4Network("224.0.0.0/4"),
    ipaddress.IPv4Network("240.0.0.0/4"),
    ipaddress.IPv4Network("255.255.255.255/32"),
]

ALWAYS_BLOCKED_IPV6 = [
    ipaddress.IPv6Network("::/128"),
    ipaddress.IPv6Network("::1/128"),
    ipaddress.IPv6Network("fe80::/10"),
    ipaddress.IPv6Network("ff00::/8"),
]

PRIVATE_IPV4 = [
    ipaddress.IPv4Network("10.0.0.0/8"),
    ipaddress.IPv4Network("172.16.0.0/12"),
    ipaddress.IPv4Network("192.168.0.0/16"),
]

PRIVATE_IPV6 = [
    # Unique local addresses.
    ipaddress.IPv6Network("fc00::/7"),
]

METADATA_IPV4 = ipaddress.IPv4Address("169.254.169.254")


@dataclass(frozen=True)
class ValidatedURL:
    url: str
    parsed: urllib.parse.ParseResult
    hostname: str
    port: int
    resolved_ips: Tuple[ipaddress._BaseAddress, ...]


def sanitize_url_for_logging(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    hostname = parsed.hostname or ""

    host = hostname
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"

    if parsed.port:
        host = f"{host}:{parsed.port}"

    safe = urllib.parse.urlunparse(
        (parsed.scheme, host, parsed.path or "/", "", "", "")
    )
    return safe.replace("\r", "").replace("\n", "")


def _is_ip_in_any_network(ip: ipaddress._BaseAddress, networks: Sequence) -> bool:
    return any(ip in network for network in networks)


def _parse_ip_literal(hostname: str) -> Optional[ipaddress._BaseAddress]:
    host = hostname.strip()

    # Try strict parsing first.
    try:
        return ipaddress.ip_address(host)
    except ValueError:
        pass

    # Try IPv4 integer forms (e.g. 2130706433) and hex (e.g. 0x7f000001)
    if host.isdigit():
        try:
            val = int(host, 10)
            if 0 <= val <= 2**32 - 1:
                return ipaddress.IPv4Address(val)
        except ValueError:
            pass

    if host.lower().startswith("0x"):
        try:
            val = int(host, 16)
            if 0 <= val <= 2**32 - 1:
                return ipaddress.IPv4Address(val)
        except ValueError:
            pass

    # Catch non-standard inet_aton parsing like 127.1, 0177.0.0.1, etc.
    try:
        packed = socket.inet_aton(host)
        return ipaddress.IPv4Address(packed)
    except OSError:
        pass

    try:
        packed6 = socket.inet_pton(socket.AF_INET6, host)
        return ipaddress.IPv6Address(packed6)
    except OSError:
        return None


def _validate_ip(ip: ipaddress._BaseAddress, allow_external: bool, allow_private: bool) -> None:
    # IPv4-mapped IPv6: validate as IPv4.
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        _validate_ip(ip.ipv4_mapped, allow_external=allow_external, allow_private=allow_private)
        return

    if isinstance(ip, ipaddress.IPv4Address):
        if ip == METADATA_IPV4:
            raise BlockedIPAddressError(
                f"Blocked IP address {ip} (cloud metadata endpoint)."
            )
        if _is_ip_in_any_network(ip, ALWAYS_BLOCKED_IPV4):
            raise BlockedIPAddressError(f"Blocked IP address {ip}.")

        if _is_ip_in_any_network(ip, PRIVATE_IPV4):
            if not allow_private:
                raise BlockedIPAddressError(f"Blocked private IP address {ip}.")
            return

        # Public IPv4
        if not allow_external:
            raise ExternalTargetNotAllowedError(
                f"External/public target is not allowed by policy ({ip})."
            )
        return

    if isinstance(ip, ipaddress.IPv6Address):
        if _is_ip_in_any_network(ip, ALWAYS_BLOCKED_IPV6):
            raise BlockedIPAddressError(f"Blocked IP address {ip}.")

        if _is_ip_in_any_network(ip, PRIVATE_IPV6):
            if not allow_private:
                raise BlockedIPAddressError(f"Blocked private IP address {ip}.")
            return

        # Global IPv6
        if not allow_external:
            raise ExternalTargetNotAllowedError(
                f"External/public target is not allowed by policy ({ip})."
            )
        return

    raise URLValidationError(f"Unsupported IP address type: {type(ip)}")


def resolve_hostname(hostname: str, port: int) -> List[ipaddress._BaseAddress]:
    results: List[ipaddress._BaseAddress] = []

    try:
        addrinfos = socket.getaddrinfo(
            hostname,
            port,
            type=socket.SOCK_STREAM,
            proto=socket.IPPROTO_TCP,
        )
    except socket.gaierror as e:
        raise URLValidationError(f"DNS resolution failed for {hostname}: {e}") from e

    for family, _, _, _, sockaddr in addrinfos:
        if family == socket.AF_INET:
            results.append(ipaddress.IPv4Address(sockaddr[0]))
        elif family == socket.AF_INET6:
            results.append(ipaddress.IPv6Address(sockaddr[0]))

    # Deduplicate while preserving ordering.
    seen = set()
    unique: List[ipaddress._BaseAddress] = []
    for ip in results:
        if ip in seen:
            continue
        unique.append(ip)
        seen.add(ip)

    return unique


def validate_url_for_request(url: str, allow_external: bool, allow_private: bool = False) -> ValidatedURL:
    parsed = urllib.parse.urlparse(url)

    if parsed.scheme not in ALLOWED_SCHEMES:
        raise URLValidationError(
            f"Unsupported URL scheme {parsed.scheme!r}. Only http/https are allowed."
        )

    if parsed.username or parsed.password:
        raise URLValidationError("Userinfo in URLs is not allowed.")

    hostname = parsed.hostname
    if not hostname:
        raise URLValidationError(f"Could not extract hostname from URL: {url!r}")

    if any(ch in hostname for ch in ("\x00", "\r", "\n", "\t", " ")):
        raise URLValidationError("Invalid characters in hostname.")

    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80

    ip_literal = _parse_ip_literal(hostname)
    if ip_literal is not None:
        _validate_ip(ip_literal, allow_external=allow_external, allow_private=allow_private)
        resolved = (ip_literal,)
        return ValidatedURL(url=url, parsed=parsed, hostname=hostname, port=port, resolved_ips=resolved)

    resolved_ips = resolve_hostname(hostname, port)
    if not resolved_ips:
        raise URLValidationError(f"DNS resolution returned no A/AAAA records for {hostname}.")

    for ip in resolved_ips:
        _validate_ip(ip, allow_external=allow_external, allow_private=allow_private)

    return ValidatedURL(
        url=url, parsed=parsed, hostname=hostname, port=port, resolved_ips=tuple(resolved_ips)
    )
