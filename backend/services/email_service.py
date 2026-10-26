import asyncio
import json
import smtplib
import ssl
from email.message import EmailMessage
from typing import Optional
from urllib.request import Request, urlopen

from config import get_settings


class EmailService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def is_configured(self) -> bool:
        return bool((self.settings.mail_service_url and self.settings.mail_service_key) or (self.settings.smtp_host and self.settings.smtp_from_email))

    async def send_account_link(self, recipient: str, subject: str, message: str, action_url: str) -> bool:
        if not self.is_configured:
            print("[ERROR] SMTP is not configured; account email was not sent")
            return False

        if self.settings.mail_service_url and self.settings.mail_service_key:
            await asyncio.to_thread(self._send_shared, recipient, subject, f"{message}\n\n{action_url}\n\n若非本人操作，請忽略這封信。")
            return True

        email = EmailMessage()
        email["Subject"] = subject
        email["From"] = self.settings.smtp_from_email
        email["To"] = recipient
        email.set_content(f"{message}\n\n{action_url}\n\n若非本人操作，請忽略這封信。")

        await asyncio.to_thread(self._send, email)
        return True

    def _send(self, email: EmailMessage) -> None:
        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=15) as smtp:
            if self.settings.smtp_use_tls:
                smtp.starttls(context=ssl.create_default_context())
            if self.settings.smtp_username:
                smtp.login(self.settings.smtp_username, self.settings.smtp_password)
            smtp.send_message(email)

    def _send_shared(self, recipient: str, subject: str, text: str) -> None:
        request = Request(
            self.settings.mail_service_url.rstrip("/") + "/api/mail/send",
            data=json.dumps({"recipient": recipient, "subject": subject, "text": text}).encode(),
            headers={"Content-Type": "application/json", "X-Mail-Key": self.settings.mail_service_key},
            method="POST",
        )
        with urlopen(request, timeout=25) as response:
            if response.status != 200:
                raise OSError("Shared mail service failed")


email_service = EmailService()
