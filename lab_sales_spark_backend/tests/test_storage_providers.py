"""Unit tests for Storage Providers and StorageManager (OOP / Strategy Pattern)."""
import os
import shutil
import tempfile
import unittest
from core.storage.base import BaseStorageProvider
from core.storage.sqlite_provider import SqliteStorageProvider
from core.storage.manager import StorageManager


class TestStorageProviders(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.sqlite_path = os.path.join(self.temp_dir, "test_spark.db")
        self.provider = SqliteStorageProvider(db_path=self.sqlite_path)
        self.provider.initialize()
        self.test_uid = "test-user-ayato"

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_sqlite_provider_chats_and_messages(self):
        # 1. Save message in chat
        chat_id = "test-chat-001"
        self.provider.save_message(
            uid=self.test_uid,
            chat_id=chat_id,
            role="user",
            content="こんにちは、GeMo！",
            title="挨拶チャット",
            model="spark-pro",
        )
        self.provider.save_message(
            uid=self.test_uid,
            chat_id=chat_id,
            role="assistant",
            content="😆はいっ！こんにちは！",
        )

        # 2. Get chats
        chats = self.provider.get_chats(self.test_uid)
        self.assertEqual(len(chats), 1)
        self.assertEqual(chats[0]["id"], chat_id)
        self.assertEqual(chats[0]["title"], "挨拶チャット")

        # 3. Get messages
        messages = self.provider.get_messages(self.test_uid, chat_id)
        self.assertEqual(len(messages), 2)
        self.assertEqual(messages[0]["role"], "user")
        self.assertEqual(messages[0]["content"], "こんにちは、GeMo！")
        self.assertEqual(messages[1]["role"], "assistant")

        # 4. Delete chat
        self.provider.delete_chat(self.test_uid, chat_id)
        self.assertEqual(len(self.provider.get_chats(self.test_uid)), 0)
        self.assertEqual(len(self.provider.get_messages(self.test_uid, chat_id)), 0)

    def test_sqlite_provider_voice_memory_and_skills(self):
        # 1. Save active minutes
        res = self.provider.save_user_minutes_and_archive_old(
            uid=self.test_uid,
            new_minutes="第1回ミーティング要約: 新機能リリース決定",
        )
        self.assertFalse(res["archived_previous"])

        # 2. Fetch active minutes
        current = self.provider.get_user_current_minutes(self.test_uid)
        self.assertEqual(current, "第1回ミーティング要約: 新機能リリース決定")

        # 3. Save new minutes -> archives previous into skills
        res2 = self.provider.save_user_minutes_and_archive_old(
            uid=self.test_uid,
            new_minutes="第2回ミーティング要約: SQLiteローカル保存完了",
            archive_title="第1回議事録アーカイブ",
        )
        self.assertTrue(res2["archived_previous"])

        # 4. Search skills
        skills = self.provider.search_user_skills(self.test_uid, query="リリース")
        self.assertEqual(len(skills), 1)
        self.assertEqual(skills[0]["title"], "第1回議事録アーカイブ")
        self.assertIn("新機能リリース決定", skills[0]["content"])

    def test_sqlite_provider_digital_cards(self):
        card_data = {
            "company_name": "株式会社スパーク",
            "person_name": "山田 太郎",
            "position": "CEO",
            "email": "yamada@example.com",
            "notes": "重要クライアント",
            "tags": ["VIP", "役員"],
        }
        res = self.provider.save_digital_business_card(self.test_uid, card_data)
        card_id = res["id"]
        self.assertIsNotNone(card_id)

        cards = self.provider.get_digital_business_cards(self.test_uid, query="山田")
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["person_name"], "山田 太郎")
        self.assertEqual(cards[0]["tags"], ["VIP", "役員"])

        # Delete
        ok = self.provider.delete_digital_business_card(self.test_uid, card_id)
        self.assertTrue(ok)
        self.assertEqual(len(self.provider.get_digital_business_cards(self.test_uid)), 0)

    def test_storage_manager_mode_switch(self):
        manager = StorageManager.get_instance()
        initial_mode = manager.mode

        manager.set_mode("local")
        self.assertEqual(manager.mode, "local")
        self.assertEqual(manager.get_provider().provider_type, "local")

        manager.set_mode("cloud")
        self.assertEqual(manager.mode, "cloud")
        self.assertEqual(manager.get_provider().provider_type, "cloud")

        # restore initial mode
        manager.set_mode(initial_mode)


if __name__ == "__main__":
    unittest.main()
