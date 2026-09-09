"""Offline regressions: run with `python test_metadata_search.py`."""
import asyncio
import unittest
from unittest.mock import AsyncMock, patch

import httpx
from fastapi import FastAPI, HTTPException

from routers import search, video
from services.cache_service import cache_service
from services.video_metadata_service import VideoMetadataService, video_metadata_service
from services.youtube_url import extract_youtube_video_id
from services.ytdlp_service import YtDlpService, ytdlp_service


VIDEO_ID = 'EgOUIGkHGj8'
LIVE_URL = f'https://www.youtube.com/live/{VIDEO_ID}?si=o_OWOYFwuBw4mG4C'
SUMMARY = {'id': VIDEO_ID, 'title': 'Bethel Church Service', 'duration': 10475}


class MetadataSearchTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.values = {}

        async def get(key):
            return self.values.get(key)

        async def put(key, value, ttl=3600):
            self.values[key] = value
            return True

        self.get_patch = patch.object(cache_service, 'get', side_effect=get)
        self.set_patch = patch.object(cache_service, 'set', side_effect=put)
        self.get_patch.start()
        self.set_patch.start()
        self.addCleanup(self.get_patch.stop)
        self.addCleanup(self.set_patch.stop)

    def test_supported_urls_and_host_validation(self):
        for value in [VIDEO_ID, LIVE_URL, f'https://youtu.be/{VIDEO_ID}?t=60',
                      f'https://m.youtube.com/watch?si=x&v={VIDEO_ID}',
                      f'youtube.com/shorts/{VIDEO_ID}', f'//www.youtube.com/embed/{VIDEO_ID}']:
            self.assertEqual(extract_youtube_video_id(value), VIDEO_ID)
        for value in ['音樂', f'https://youtube.com.evil.test/watch?v={VIDEO_ID}',
                      f'https://evil.test/youtu.be/{VIDEO_ID}',
                      f'https://youtube.com@evil.test/watch?v={VIDEO_ID}',
                      f'https://youtu.be/{VIDEO_ID}more', f'ftp://youtu.be/{VIDEO_ID}']:
            self.assertIsNone(extract_youtube_video_id(value))

    async def test_shared_lookup_survives_client_cancellation_and_is_cached(self):
        service = VideoMetadataService()
        started, finish = asyncio.Event(), asyncio.Event()

        async def fetch(_id):
            started.set()
            await finish.wait()
            return SUMMARY

        with patch.object(ytdlp_service, 'get_video_metadata', side_effect=fetch) as lookup:
            first = asyncio.create_task(service.get(LIVE_URL))
            await started.wait()
            second = asyncio.create_task(service.get(VIDEO_ID))
            await asyncio.sleep(0)
            first.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await first
            finish.set()
            self.assertEqual(await second, SUMMARY)
            self.assertEqual(await service.get(LIVE_URL), SUMMARY)
            self.assertEqual(lookup.await_count, 1)

    async def test_timeout_uses_oembed_without_playback_extraction(self):
        service = VideoMetadataService()
        response = httpx.Response(200, json={'title': SUMMARY['title'], 'author_name': 'Bethel'},
                                  request=httpx.Request('GET', 'https://www.youtube.com/oembed'))
        with patch.object(ytdlp_service, 'get_video_metadata', side_effect=asyncio.TimeoutError), \
                patch.object(ytdlp_service, 'get_video_info') as playback, \
                patch('services.video_metadata_service.httpx.AsyncClient') as client:
            client.return_value.__aenter__.return_value.get = AsyncMock(return_value=response)
            result = await service.get(LIVE_URL)
            self.assertEqual(result['id'], VIDEO_ID)
            self.assertEqual(result['title'], SUMMARY['title'])
            self.assertIsNone(result['duration'])
            playback.assert_not_called()

    async def test_unavailable_and_temporary_failure_are_distinct(self):
        for upstream_status, expected_status in [(404, 404), (503, 503)]:
            response = httpx.Response(upstream_status, request=httpx.Request('GET', 'https://www.youtube.com/oembed'))
            with patch.object(ytdlp_service, 'get_video_metadata', return_value=None), \
                    patch('services.video_metadata_service.httpx.AsyncClient') as client:
                client.return_value.__aenter__.return_value.get = AsyncMock(return_value=response)
                with self.assertRaises(HTTPException) as error:
                    await VideoMetadataService().get(LIVE_URL)
                self.assertEqual(error.exception.status_code, expected_status)
                self.assertFalse(self.values)

    async def test_url_search_works_for_json_and_old_streaming_clients(self):
        app = FastAPI()
        app.include_router(search.router, prefix='/api/search')
        app.include_router(video.router, prefix='/api/video')
        with patch.object(video_metadata_service, 'get', return_value=SUMMARY), \
                patch.object(ytdlp_service, 'search') as keyword_search, \
                patch.object(ytdlp_service, 'get_video_info') as playback:
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
                result = await client.get('/api/search', params={'q': LIVE_URL})
                self.assertEqual(result.json()['results'], [SUMMARY])
                page = await client.get('/api/search', params={'q': LIVE_URL, 'offset': 1})
                self.assertEqual(page.json()['results'], [])
                stream = await client.get('/api/search/stream', params={'q': LIVE_URL})
                self.assertEqual(stream.status_code, 200)
                self.assertIn('event: batch', stream.text)
                self.assertIn('10475', stream.text)
                self.assertIn('event: complete', stream.text)
                metadata = await client.get(f'/api/video/metadata/{VIDEO_ID}')
                self.assertEqual(metadata.json(), SUMMARY)
                related = await client.get('/api/search/related', params={'q': LIVE_URL})
                self.assertEqual(related.json()['results'], [])
            keyword_search.assert_not_called()
            playback.assert_not_called()

    async def test_channel_feed_uses_flat_metadata_and_shares_requests(self):
        service = YtDlpService()
        self.addCleanup(service._metadata_executor.shutdown)
        self.addCleanup(service._channel_executor.shutdown)
        channel_id = 'UCCXeH0YaG1FgC5a3Ueie-EA'
        with patch('services.ytdlp_service.yt_dlp.YoutubeDL') as downloader:
            downloader.return_value.__enter__.return_value.extract_info.return_value = {
                'title': 'Bethel', 'entries': [{
                    'id': VIDEO_ID, 'title': 'Service', 'duration': 10475,
                    'timestamp': 1788912000, 'thumbnails': [{'url': 'https://example.test/thumb.jpg'}],
                }],
            }
            feeds = await asyncio.gather(*(service.get_channel_latest_videos(channel_id) for _ in range(4)))
            self.assertEqual(feeds[0][0]['duration'], 10475)
            self.assertEqual(feeds[0][0]['published_at'], '2026-09-09')
            self.assertEqual(feeds[0][0]['thumbnail'], 'https://example.test/thumb.jpg')
            self.assertTrue(downloader.call_args.args[0]['extract_flat'])
            self.assertEqual(downloader.call_count, 1)
            self.assertEqual(await service.get_channel_latest_videos(channel_id), feeds[0])
            self.assertEqual(downloader.call_count, 1)

    async def test_search_preserves_dates_without_resolving_video_streams(self):
        with patch('services.ytdlp_service.yt_dlp.YoutubeDL') as downloader:
            downloader.return_value.__enter__.return_value.extract_info.return_value = {
                'entries': [{'id': VIDEO_ID, 'title': 'Service', 'duration': 10475,
                             'timestamp': 1788912000, 'uploader': 'Bethel'}],
            }
            results = await ytdlp_service.search('Bethel', max_results=50)
            options = downloader.call_args.args[0]
            self.assertTrue(options['extract_flat'])
            self.assertEqual(options['extractor_args']['youtubetab']['approximate_date'], ['true'])
            self.assertEqual(results[0]['published_at'], '2026-09-09T00:00:00+00:00')
            self.assertEqual(results[0]['duration'], 10475)


if __name__ == '__main__':
    unittest.main()
