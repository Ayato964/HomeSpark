"""Abstract Base Storage Provider.

Defines the contract for all storage engines (PostgreSQL, SQLite, etc.)
adhering to Object-Oriented principles (Repository / Strategy Pattern).
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional


class BaseStorageProvider(ABC):
    """Abstract base class for HomeSpark data persistence."""

    @property
    @abstractmethod
    def provider_type(self) -> str:
        """Returns provider identifier: 'cloud' or 'local'."""
        pass

    @abstractmethod
    def initialize(self) -> None:
        """Initialize required database schemas, tables, and connection pools."""
        pass

    # ----------------------------------------------------------------------- #
    # Chats & Messages
    # ----------------------------------------------------------------------- #
    @abstractmethod
    def get_chats(self, uid: str) -> List[Dict[str, Any]]:
        """Retrieve all chat sessions for the user, ordered by last update."""
        pass

    @abstractmethod
    def get_messages(self, uid: str, chat_id: str) -> List[Dict[str, Any]]:
        """Retrieve all messages for a specific chat session."""
        pass

    @abstractmethod
    def save_message(
        self,
        uid: str,
        chat_id: str,
        role: str,
        content: Any,
        title: Optional[str] = None,
        model: Optional[str] = None,
        tool_calls: Optional[Any] = None,
        tool_call_id: Optional[str] = None,
        name: Optional[str] = None,
        **kwargs: Any,
    ) -> None:
        """Append a message to a chat session and update session metadata."""
        pass

    @abstractmethod
    def delete_chat(self, uid: str, chat_id: str) -> None:
        """Delete a chat session and all its associated messages."""
        pass

    # ----------------------------------------------------------------------- #
    # Voice Memory & Skills (Long-term Archives)
    # ----------------------------------------------------------------------- #
    @abstractmethod
    def get_user_current_minutes(self, uid: str) -> Optional[str]:
        """Fetch the latest active conversation minutes / summary."""
        pass

    @abstractmethod
    def save_user_minutes_and_archive_old(
        self, uid: str, new_minutes: str, archive_title: Optional[str] = None
    ) -> Dict[str, Any]:
        """Save new minutes and archive the previous minutes into long-term skills."""
        pass

    @abstractmethod
    def search_user_skills(
        self, uid: str, query: str = "", limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Search or list past skills/memories/minutes archives for the user."""
        pass

    # ----------------------------------------------------------------------- #
    # Digital Business Cards
    # ----------------------------------------------------------------------- #
    @abstractmethod
    def get_digital_business_cards(
        self, uid: str, query: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List or search digital business cards."""
        pass

    @abstractmethod
    def save_digital_business_card(
        self, uid: str, card_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create or update a digital business card."""
        pass

    @abstractmethod
    def delete_digital_business_card(self, uid: str, card_id: str) -> bool:
        """Delete a digital business card by ID."""
        pass

    # ----------------------------------------------------------------------- #
    # External IMAP / SMTP Email Accounts
    # ----------------------------------------------------------------------- #
    @abstractmethod
    def get_imap_accounts(self, uid: str) -> List[Dict[str, Any]]:
        """Retrieve all configured external IMAP/SMTP accounts."""
        pass

    @abstractmethod
    def get_imap_account_by_id(
        self, uid: str, account_id: str
    ) -> Optional[Dict[str, Any]]:
        """Retrieve a specific IMAP/SMTP account by ID."""
        pass

    @abstractmethod
    def save_imap_account(
        self, uid: str, account_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create or update an external email account."""
        pass

    @abstractmethod
    def delete_imap_account(self, uid: str, account_id: str) -> bool:
        """Delete an external email account by ID."""
        pass

    # ----------------------------------------------------------------------- #
    # Google OAuth Tokens
    # ----------------------------------------------------------------------- #
    @abstractmethod
    def save_google_tokens(self, uid: str, tokens: Dict[str, Any]) -> None:
        """Save or update Google OAuth tokens."""
        pass

    @abstractmethod
    def get_google_tokens(self, uid: str) -> Optional[Dict[str, Any]]:
        """Retrieve Google OAuth tokens."""
        pass

    @abstractmethod
    def delete_google_tokens(self, uid: str) -> None:
        """Delete Google OAuth tokens."""
        pass
