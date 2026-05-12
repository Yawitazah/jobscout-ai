from __future__ import annotations

import base64
import logging
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

logger = logging.getLogger(__name__)

ENCRYPTION_KEY = os.environ.get("TOKEN_ENCRYPTION_KEY", "")


@dataclass
class ParsedMessage:
    id: str
    thread_id: str
    from_address: str
    from_name: str
    to_address: str
    subject: str
    snippet: str
    body_text: str
    body_html: str
    received_at: datetime
    labels: list[str]


def _decrypt(ciphertext: str) -> str:
    """Mirror of the TS AES-256-GCM decrypt. Format: ivHex:tagHex:encHex."""
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    key_bytes = bytes.fromhex(ENCRYPTION_KEY)
    iv_hex, tag_hex, enc_hex = ciphertext.split(":")
    iv = bytes.fromhex(iv_hex)
    tag = bytes.fromhex(tag_hex)
    enc = bytes.fromhex(enc_hex)
    aesgcm = AESGCM(key_bytes)
    plaintext = aesgcm.decrypt(iv, enc + tag, None)
    return plaintext.decode("utf-8")


def _encrypt(plaintext: str) -> str:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    import secrets
    key_bytes = bytes.fromhex(ENCRYPTION_KEY)
    iv = secrets.token_bytes(12)
    aesgcm = AESGCM(key_bytes)
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]
    return f"{iv.hex()}:{tag.hex()}:{ct.hex()}"


class GmailClient:
    def __init__(self, connection_row: dict) -> None:
        self.connection = connection_row
        self._service = None

    def _build_credentials(self) -> Credentials:
        access_token = _decrypt(self.connection["access_token"])
        refresh_token = (
            _decrypt(self.connection["refresh_token"])
            if self.connection.get("refresh_token")
            else None
        )
        expiry = None
        if self.connection.get("token_expires_at"):
            expiry = datetime.fromisoformat(
                self.connection["token_expires_at"].replace("Z", "+00:00")
            )
        return Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.environ["GOOGLE_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_CLIENT_SECRET"],
            expiry=expiry,
        )

    def _get_service(self):
        if self._service is None:
            creds = self._build_credentials()
            self._service = build("gmail", "v1", credentials=creds, cache_discovery=False)
        return self._service

    def refresh_if_needed(self, supabase=None) -> None:
        creds = self._build_credentials()
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            if supabase:
                supabase.table("email_connections").update({
                    "access_token": _encrypt(creds.token),
                    "token_expires_at": creds.expiry.isoformat() if creds.expiry else None,
                }).eq("id", self.connection["id"]).execute()
            self._service = None

    def list_history_since(self, history_id: str) -> tuple[list[str], str]:
        svc = self._get_service()
        result = svc.users().history().list(
            userId="me",
            startHistoryId=history_id,
            historyTypes=["messageAdded"],
        ).execute()
        msg_ids: list[str] = []
        for h in result.get("history", []):
            for m in h.get("messagesAdded", []):
                mid = m.get("message", {}).get("id")
                if mid:
                    msg_ids.append(mid)
        return msg_ids, result.get("historyId", history_id)

    def list_messages_in_range(self, after_ts: datetime, query_extra: str = "") -> list[str]:
        after_epoch = int(after_ts.timestamp())
        q = (
            f"after:{after_epoch} "
            "-category:promotions -category:social -category:forums "
            "-from:noreply@ -from:no-reply@ -from:newsletter@ -from:marketing@ "
            + query_extra
        )
        svc = self._get_service()
        msg_ids: list[str] = []
        page_token = None
        while True:
            kwargs: dict = {"userId": "me", "q": q, "maxResults": 500}
            if page_token:
                kwargs["pageToken"] = page_token
            res = svc.users().messages().list(**kwargs).execute()
            for m in res.get("messages", []):
                msg_ids.append(m["id"])
            page_token = res.get("nextPageToken")
            if not page_token:
                break
        return msg_ids

    def get_message(self, msg_id: str) -> ParsedMessage | None:
        svc = self._get_service()
        try:
            raw = svc.users().messages().get(userId="me", id=msg_id, format="full").execute()
        except Exception as exc:
            logger.warning("Failed to fetch message %s: %s", msg_id, exc)
            return None
        return _parse_message(raw)


def _parse_message(raw: dict) -> ParsedMessage | None:
    payload = raw.get("payload")
    if not payload:
        return None

    headers: dict[str, str] = {}
    for h in payload.get("headers", []):
        headers[h["name"].lower()] = h["value"]

    from_raw = headers.get("from", "")
    from_address, from_name = _parse_email_address(from_raw)
    to_raw = headers.get("to", "")
    to_address, _ = _parse_email_address(to_raw)

    body_text, body_html = _extract_body(payload)
    internal_date = int(raw.get("internalDate", 0))
    received_at = datetime.fromtimestamp(internal_date / 1000, tz=timezone.utc)

    return ParsedMessage(
        id=raw["id"],
        thread_id=raw.get("threadId", ""),
        from_address=from_address,
        from_name=from_name,
        to_address=to_address,
        subject=headers.get("subject", ""),
        snippet=raw.get("snippet", ""),
        body_text=body_text,
        body_html=body_html,
        received_at=received_at,
        labels=raw.get("labelIds", []),
    )


def _parse_email_address(raw: str) -> tuple[str, str]:
    m = re.match(r'^(.*?)\s*<(.+?)>\s*$', raw)
    if m:
        return m.group(2).strip(), m.group(1).replace('"', '').strip()
    return raw.strip(), ""


def _extract_body(payload: dict) -> tuple[str, str]:
    text = ""
    html = ""

    def walk(part: dict) -> None:
        nonlocal text, html
        mime = part.get("mimeType", "")
        data = (part.get("body") or {}).get("data")
        if data:
            decoded = base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="replace")
            if mime == "text/plain":
                text = decoded
            elif mime == "text/html":
                html = decoded
        for sub in part.get("parts", []):
            walk(sub)

    walk(payload)
    return text, html


MARKETING_PREFIXES = (
    "noreply@", "no-reply@", "newsletter@", "marketing@",
    "notifications@", "updates@", "info@", "donotreply@",
)


def should_skip_message(msg: ParsedMessage) -> bool:
    addr = msg.from_address.lower()
    if any(addr.startswith(p) for p in MARKETING_PREFIXES):
        return True
    if "CATEGORY_PROMOTIONS" in msg.labels or "CATEGORY_SOCIAL" in msg.labels:
        return True
    subject_lower = (msg.subject or "").lower()
    if "unsubscribe" in subject_lower:
        return True
    return False
