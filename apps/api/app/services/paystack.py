"""Paystack test-mode transport and raw-body webhook authentication."""
import hashlib
import hmac
import json
import re
import time
from urllib.parse import urlsplit

import httpx

from app.core.config import settings

REFERENCE = re.compile(r"ivtest-[0-9a-f]{32}")
_HEX = re.compile(r"[0-9a-f]{128}")
_MAX_RESPONSE = 128 * 1024


class ProviderError(Exception):
    pass


def test_key() -> str | None:
    value = settings.paystack_test_secret
    raw = value.get_secret_value() if value else ""
    if settings.paystack_sandbox_enabled and raw.startswith("sk_test_") and len(raw) > 8:
        return raw
    return None


def _request(method: str, path: str, *, payload: dict | None = None) -> dict:
    key = test_key()
    if key is None:
        raise ProviderError("Sandbox checkout is unavailable.")
    try:
        with httpx.Client(timeout=7.0, follow_redirects=False) as client, client.stream(
            method, "https://api.paystack.co" + path, json=payload,
            headers={"Authorization": "Bearer " + key, "Accept": "application/json"},
        ) as response:
            response.raise_for_status()
            body = bytearray()
            for chunk in response.iter_bytes(chunk_size=8192):
                body.extend(chunk)
                if len(body) > _MAX_RESPONSE:
                    raise ProviderError("Unexpected sandbox response.")
            envelope = json.loads(body)
    except (httpx.HTTPError, ValueError, RecursionError) as exc:
        raise ProviderError("Paystack sandbox did not confirm this request.") from exc
    if not isinstance(envelope, dict) or envelope.get("status") is not True or not isinstance(envelope.get("data"), dict):
        raise ProviderError("Paystack sandbox did not confirm this request.")
    return envelope["data"]


def initialize(reference: str, email: str, amount: int) -> str:
    if not REFERENCE.fullmatch(reference):
        raise ValueError("Invalid checkout reference.")
    result = _request("POST", "/transaction/initialize", payload={
        "reference": reference, "email": email, "amount": str(amount), "currency": "NGN",
        "callback_url": settings.app_url.rstrip("/") + "/billing",
    })
    url = result.get("authorization_url")
    if not isinstance(url, str) or not re.fullmatch(r"https://checkout\.paystack\.com/[A-Za-z0-9_-]{1,150}", url):
        raise ProviderError("Unexpected sandbox checkout address.")
    if result.get("reference") != reference or urlsplit(url).netloc != "checkout.paystack.com":
        raise ProviderError("Unexpected sandbox checkout reference.")
    return url


def verify(reference: str) -> dict:
    if not REFERENCE.fullmatch(reference):
        raise ValueError("Invalid checkout reference.")
    return _request("GET", "/transaction/verify/" + reference)


def signed_webhook(body: bytes, signature: str | None, legacy: str | None, *, timestamp: int | None = None) -> bool:
    if signature is not None:
        secret = settings.paystack_webhook_secret
        if secret is None or len(signature) > 4096:
            return False
        fields = [field.strip().partition("=") for field in signature.split(",")]
        times = [value for name, sep, value in fields if name == "t" and sep]
        if len(times) != 1 or not re.fullmatch(r"[0-9]{1,12}", times[0]):
            return False
        if abs((int(time.time()) if timestamp is None else timestamp) - int(times[0])) > 300:
            return False
        expected = hmac.new(secret.get_secret_value().encode(), times[0].encode() + b"." + body,
                            hashlib.sha512).hexdigest()
        matched = False
        for name, sep, value in fields:
            if name == "v1" and sep:
                kid, colon, digest = value.partition(":")
                if kid.startswith("whk_") and colon and _HEX.fullmatch(digest):
                    matched |= hmac.compare_digest(expected, digest)
        return matched
    key = test_key()
    if not settings.paystack_allow_legacy_signature or key is None or not legacy or not _HEX.fullmatch(legacy):
        return False
    return hmac.compare_digest(hmac.new(key.encode(), body, hashlib.sha512).hexdigest(), legacy)
