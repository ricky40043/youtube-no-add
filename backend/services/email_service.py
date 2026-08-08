import asyncio
import smtplib
from email.message import EmailMessage
from typing import Optional

from config import get_settings


class EmailService:
    def __init__(self) -> None:
        self.settings = get_settings()

    @property
    def is_configured(self) -> bool:
        return bool(self.settings.smtp_host and self.settings.smtp_from_email)

    async def send_account_link(self, recipient: str, subject: str, message: str, action_url: str) -> bool:
        if not self.is_configured:
            print("[ERROR] SMTP is not configured; account email was not sent")
            return False

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
                smtp.starttls()
            if self.settings.smtp_username:
                smtp.login(self.settings.smtp_username, self.settings.smtp_password)
            smtp.send_message(email)


email_service = EmailService()
