import logging
import urllib.parse
from typing import Any, Optional, Tuple, Union

import requests

from .url_validator import URLValidationError, sanitize_url_for_logging, validate_url_for_request

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT: Tuple[float, float] = (3.05, 10.0)
REDIRECT_STATUSES = {301, 302, 303, 307, 308}


def _normalize_timeout(timeout: Optional[Union[float, Tuple[float, float]]]) -> Union[float, Tuple[float, float]]:
    if timeout is None:
        return DEFAULT_TIMEOUT
    if isinstance(timeout, (int, float)):
        value = float(timeout)
        return (value, value)
    return timeout


def request(
    method: str,
    url: str,
    *,
    allow_external: bool,
    allow_private: bool = False,
    timeout: Optional[Union[float, Tuple[float, float]]] = None,
    allow_redirects: bool = False,
    max_redirects: int = 5,
    session: Optional[requests.Session] = None,
    **kwargs: Any,
) -> requests.Response:
    timeout = _normalize_timeout(timeout)

    sess = session or requests.Session()
    sess.trust_env = False

    current_url = url
    current_method = method.upper()

    history = []

    for _ in range(max_redirects + 1):
        validated = validate_url_for_request(
            current_url,
            allow_external=allow_external,
            allow_private=allow_private,
        )

        logger.info(
            "Outbound request: method=%s url=%s resolved_ips=%s timeout=%s allow_redirects=%s",
            current_method,
            sanitize_url_for_logging(current_url),
            [str(ip) for ip in validated.resolved_ips],
            timeout,
            allow_redirects,
        )

        resp = sess.request(
            current_method,
            current_url,
            timeout=timeout,
            allow_redirects=False,
            **kwargs,
        )

        if not allow_redirects:
            resp.history = history
            return resp

        if resp.status_code not in REDIRECT_STATUSES:
            resp.history = history
            return resp

        location = resp.headers.get("Location")
        if not location:
            resp.history = history
            return resp

        next_url = urllib.parse.urljoin(current_url, location)
        history.append(resp)

        # Match requests behaviour for common redirect cases.
        if resp.status_code == 303 or (resp.status_code in (301, 302) and current_method == "POST"):
            current_method = "GET"
            kwargs = {k: v for k, v in kwargs.items() if k not in {"data", "json"}}

        resp.close()
        current_url = next_url

    raise URLValidationError(f"Too many redirects while requesting {sanitize_url_for_logging(url)}")


def get(
    url: str,
    *,
    allow_external: bool,
    allow_private: bool = False,
    timeout: Optional[Union[float, Tuple[float, float]]] = None,
    allow_redirects: bool = False,
    max_redirects: int = 5,
    session: Optional[requests.Session] = None,
    **kwargs: Any,
) -> requests.Response:
    return request(
        "GET",
        url,
        allow_external=allow_external,
        allow_private=allow_private,
        timeout=timeout,
        allow_redirects=allow_redirects,
        max_redirects=max_redirects,
        session=session,
        **kwargs,
    )
