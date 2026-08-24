"""Standalone smoke test for the Sales Spark Postgres persistence layer.

Exercises core/store.py end-to-end against a live Postgres database:
chat creation, message ordering / JSONB round-trip, title derivation,
per-user isolation, Google token upsert + refresh-token preservation, and
cleanup.

Run from the ``main/`` directory:

    python scripts/test_pg_store.py

Requires DATABASE_URL (or DATABASE_URL_POOLED) to point at a throwaway /
DEV Postgres branch. The test writes only under unique, time-derived uids
and deletes everything it creates.
"""
from __future__ import annotations

import os
import sys
import time
import uuid

# Make the parent dir (main/) importable, exactly like server.py does for its
# own dir, so `config` and `core` resolve when run as `python scripts/...`.
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Best-effort: load a local .env so DATABASE_URL is available. Optional.
try:
    from dotenv import load_dotenv

    load_dotenv()
except Exception:
    pass

from config.const import DATABASE_URL  # noqa: E402

if not DATABASE_URL:
    print(
        "SKIP: config.const.DATABASE_URL is empty. Set DATABASE_URL (or "
        "DATABASE_URL_POOLED) to a DEV Postgres DSN and re-run.\n"
        "No database configured, nothing to test."
    )
    sys.exit(2)

from core import store  # noqa: E402


# --------------------------------------------------------------------------- #
# Tiny assertion harness: records pass/fail instead of raising on first failure.
# --------------------------------------------------------------------------- #
_results: list[tuple[bool, str]] = []


def check(condition: bool, label: str) -> bool:
    ok = bool(condition)
    _results.append((ok, label))
    print(f"  [{'PASS' if ok else 'FAIL'}] {label}")
    return ok


def main() -> int:
    # Two distinct, collision-proof uids derived from time.
    stamp = int(time.time())
    user_a = f"smoketest-{stamp}-A"
    user_b = f"smoketest-{stamp}-B"
    chat_id = str(uuid.uuid4())

    print(f"Using DATABASE_URL (len={len(DATABASE_URL)}); userA={user_a!r} "
          f"userB={user_b!r} chat_id={chat_id}")

    try:
        # --- a. Build a chat for userA -------------------------------------- #
        print("\n[a] Creating a 5-message chat for userA")
        store.save_message(user_a, chat_id, "user", "こんにちは、田中です")
        store.save_message(
            user_a,
            chat_id,
            "assistant",
            None,
            tool_calls=[
                {
                    "id": "c1",
                    "type": "function",
                    "function": {"name": "gmail_search", "arguments": "{}"},
                }
            ],
        )
        store.save_message(
            user_a,
            chat_id,
            "tool",
            "3件",
            tool_call_id="c1",
            name="gmail_search",
        )
        store.save_message(user_a, chat_id, "assistant", "こんにちは")
        store.save_message(user_a, chat_id, "user", "私の名前は?")
        check(True, "save_message x5 completed without error")

        # --- b. Order + JSONB round-trip ------------------------------------ #
        print("\n[b] Reading messages back in order")
        msgs = store.get_messages(user_a, chat_id)
        check(len(msgs) == 5, f"get_messages returns 5 messages (got {len(msgs)})")
        roles = [m["role"] for m in msgs]
        expected_roles = ["user", "assistant", "tool", "assistant", "user"]
        check(roles == expected_roles,
              f"roles in exact order {expected_roles} (got {roles})")
        if msgs:
            check(msgs[0]["content"] == "こんにちは、田中です",
                  "first message content round-trips ('こんにちは、田中です')")
            # Spot-check the tool_call message round-trips its JSONB list.
            tc = msgs[1].get("tool_calls") if len(msgs) > 1 else None
            check(
                isinstance(tc, list) and tc and tc[0].get("id") == "c1",
                "assistant tool_calls round-trips as a list with id 'c1'",
            )

        # --- c. Chat list + derived title ---------------------------------- #
        print("\n[c] Listing chats for userA")
        chats = store.get_chats(user_a)
        match = next((c for c in chats if c["chat_id"] == chat_id), None)
        check(match is not None, "get_chats includes the new chat_id")
        if match is not None:
            title = match.get("title") or ""
            check(bool(title) and title != "New Chat",
                  f"chat has a non-empty derived title (got {title!r})")
            check(title.startswith("こんにちは、田中です"),
                  "title is derived from the first user message")

        # --- d. Isolation: userB cannot see userA's chat -------------------- #
        print("\n[d] Verifying per-user isolation")
        check(store.get_messages(user_b, chat_id) == [],
              "userB get_messages(chat_id) returns []")
        b_chats = store.get_chats(user_b)
        check(all(c["chat_id"] != chat_id for c in b_chats),
              "userB get_chats does not include userA's chat_id")

        # --- e. Google tokens ---------------------------------------------- #
        print("\n[e] Google token save / get / preservation")
        store.save_google_tokens(
            user_a,
            {
                "access_token": "a1",
                "refresh_token": "r1",
                "token_uri": "u",
                "scopes": ["s1", "s2"],
                "token_expiry": "2030-01-01T00:00:00+00:00",
            },
        )
        toks = store.get_google_tokens(user_a)
        check(toks is not None, "get_google_tokens returns a record")
        if toks is not None:
            check(toks.get("refresh_token") == "r1", "refresh_token == 'r1'")
            check(toks.get("scopes") == ["s1", "s2"],
                  f"scopes list round-trips (got {toks.get('scopes')!r})")
            check(isinstance(toks.get("token_expiry"), str)
                  and toks["token_expiry"].startswith("2030-01-01"),
                  f"token_expiry is an ISO string (got {toks.get('token_expiry')!r})")

        # Upsert WITHOUT a refresh_token must preserve the stored one.
        store.save_google_tokens(user_a, {"access_token": "a2"})
        toks2 = store.get_google_tokens(user_a)
        check(toks2 is not None and toks2.get("refresh_token") == "r1",
              "refresh_token preserved as 'r1' after refresh-less upsert")
        check(toks2 is not None and toks2.get("access_token") == "a2",
              "access_token updated to 'a2' on upsert")

        # --- f. Cleanup ---------------------------------------------------- #
        print("\n[f] Cleanup")
        store.delete_chat(user_a, chat_id)
        check(store.get_messages(user_a, chat_id) == [],
              "after delete_chat, get_messages returns []")
        store.delete_google_tokens(user_a)
        check(store.get_google_tokens(user_a) is None,
              "after delete_google_tokens, get_google_tokens returns None")

    except Exception as exc:  # noqa: BLE001
        # An unexpected exception is itself a failure; record and continue to
        # the summary so we still exit non-zero with context.
        check(False, f"unexpected exception: {exc!r}")
        # Best-effort cleanup so a partial run doesn't leave rows behind.
        try:
            store.delete_chat(user_a, chat_id)
            store.delete_google_tokens(user_a)
        except Exception:
            pass

    # --- Summary ----------------------------------------------------------- #
    passed = sum(1 for ok, _ in _results if ok)
    failed = sum(1 for ok, _ in _results if not ok)
    print("\n" + "=" * 60)
    print(f"SUMMARY: {passed} passed, {failed} failed, {len(_results)} total")
    if failed:
        print("RESULT: FAIL")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
