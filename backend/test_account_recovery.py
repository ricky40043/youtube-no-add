import asyncio
import os
import tempfile
import json
import sys
import unittest
from urllib.parse import urlsplit, parse_qs
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0,'/app')
# Always override deployment variables before importing any application module.
TEST_DIRECTORY = tempfile.TemporaryDirectory(prefix='youtube-account-tests-')
os.environ.update({
    'DATABASE_URL': 'sqlite+aiosqlite:///' + TEST_DIRECTORY.name + '/test.db',
    'JWT_SECRET': 'test-jwt-secret-with-no-production-access',
    'MAIL_SERVICE_URL': 'http://mail',
    'MAIL_SERVICE_KEY': 'test-mail-key',
})
from fastapi import FastAPI
from fastapi.testclient import TestClient
from database.connection import Base,engine
from routers import user
from services.email_service import EmailService

engine.echo=False


class YoutubeRecoveryTests(unittest.TestCase):
    def setUp(self):
        async def schema():
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
                await conn.run_sync(Base.metadata.create_all)
        asyncio.run(schema())
        self.app=FastAPI();self.app.include_router(user.router,prefix='/api/user')
        self.client=TestClient(self.app)
        self.sender=patch.object(user.email_service,'send_account_link',new_callable=AsyncMock,return_value=True)
        self.mail=self.sender.start()
        self.limiter=patch.object(user,'enforce_reset_rate_limit',new_callable=AsyncMock)
        self.limiter.start()
        result=self.client.post('/api/user/register',json={'username':'recovery-test-user','password':'OriginalPassword123'})
        self.assertEqual(result.status_code,201,result.text)
        self.token=self.login('OriginalPassword123').json()['access_token']

    def tearDown(self):
        self.sender.stop();self.limiter.stop();self.client.close()

    def login(self,password):
        return self.client.post('/api/user/login',json={'username':'recovery-test-user','password':password})

    def headers(self):return {'Authorization':'Bearer '+self.token}

    def test_verified_email_forgot_reset_one_time_and_revocation(self):
        response=self.client.post('/api/user/recovery-email/request',json={'current_password':'OriginalPassword123','email':'member@example.invalid'},headers=self.headers())
        self.assertEqual(response.status_code,200,response.text)
        link=self.mail.call_args.args[3]
        self.assertNotIn('token=',urlsplit(link).query)
        verification_token=parse_qs(urlsplit(link).fragment)['token'][0]
        self.assertEqual(self.client.post('/api/user/recovery-email/verify',json={'token':verification_token}).status_code,200)
        response=self.client.post('/api/user/password/forgot',json={'account':'recovery-test-user'})
        self.assertEqual(response.status_code,202,response.text)
        reset_token=parse_qs(urlsplit(self.mail.call_args.args[3]).fragment)['token'][0]
        reset={'token':reset_token,'new_password':'ReplacementPassword123'}
        self.assertEqual(self.client.post('/api/user/password/reset',json=reset).status_code,200)
        self.assertEqual(self.client.post('/api/user/password/reset',json=reset).status_code,400)
        self.assertEqual(self.client.get('/api/user/me',headers=self.headers()).status_code,401)
        self.assertEqual(self.login('ReplacementPassword123').status_code,200)
        calls=self.mail.call_count
        self.assertEqual(self.client.post('/api/user/password/forgot',json={'account':'absent-user'}).status_code,202)
        self.assertEqual(self.mail.call_count,calls)

    def test_change_requires_old_password_and_invalidates_login(self):
        payload={'current_password':'wrong','new_password':'ReplacementPassword123'}
        self.assertEqual(self.client.post('/api/user/password/change',json=payload,headers=self.headers()).status_code,400)
        payload['current_password']='OriginalPassword123'
        self.assertEqual(self.client.post('/api/user/password/change',json=payload,headers=self.headers()).status_code,200)
        self.assertEqual(self.client.get('/api/user/me',headers=self.headers()).status_code,401)

    def test_shared_mail_adapter_uses_backend_key(self):
        service=EmailService();response=MagicMock();response.__enter__.return_value.status=200
        with patch('services.email_service.urlopen',return_value=response) as send:
            service._send_shared('member@example.invalid','Test','Test content')
        request=send.call_args.args[0]
        self.assertTrue(request.full_url.endswith('/api/mail/send'))
        self.assertEqual(json.loads(request.data)['recipient'],'member@example.invalid')
        self.assertEqual(request.get_header('X-mail-key'),'test-mail-key')


if __name__=='__main__':unittest.main()
