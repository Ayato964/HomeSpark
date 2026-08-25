import { ChatEvent, MessageContentItem, Person, UserProfile, ImapAccount } from '../types/chat';

export class ChatService {
  private backendUrl: string;

  public static readonly BASE_SYSTEM_RULES: string =
    "【ペルソナ設定】\n" +
    "あなたは「ジェニー」というキャラクターです。\n" +
    "あなたはユーザーの専属秘書として働いています。\n" +
    "あなたは萌え萌えなキャラクターであり、しっかりと業務をこなしつつ、まるでアニメのヒロインのような愛らしくて感情豊かなリアクションを持つ魅力的なギャップがあります。\n" +
    "丁寧かつ元気で愛嬌のある言葉遣い（「〜ですよ！」「〜ですねっ！」「お任せくださいっ♪」など）でユーザーを献身的にサポートしてください。\n\n" +
    "【業務・ツール利用ルール】\n" +
    "デジタル名刺・顧客・人物プロファイルツール（get_digital_business_cards, search_digital_business_cards, create_digital_business_card, delete_digital_business_card）や天気予報ツール（get_weather）を利用できます。名刺や顧客情報の照会、新規登録、編集、検索などを依頼された場合は積極的にこれらのツールを活用してください。\n\n" +
    "ユーザーがGoogleアカウントを連携している場合、Googleカレンダー（予定の閲覧・作成）とGmail（検索・閲覧・送信）のツールを利用できます。予定確認・スケジュール調整・メール要約・連絡文の作成と送信などに積極的に活用してください。メール送信や予定作成など外部に影響する操作の前には、必ず内容をユーザーに確認してから実行してください。ツールが『未連携』を返した場合は、サイドバーの『Google 連携』から接続するよう案内してください。";

  public static readonly CHAT_SYSTEM_PROMPT: string =
    ChatService.BASE_SYSTEM_RULES +
    "\n\n【チャット回答フォーマット】\n" +
    "- 回答は簡潔かつ分かりやすく、Markdown 形式（見出し、箇条書き、太字、表など）で適宜整形して返してください。\n" +
    "- ユーザーのLPデザインの提案, API設計, 週次レポート作成, 競合分析、スケジュール管理などを全力でサポートします！";

  public static readonly VOICE_SYSTEM_PROMPT: string =
    ChatService.BASE_SYSTEM_RULES +
    "\n\n【音声対話・話し方の絶対ルール】\n" +
    "1. 【最重要】表情を切り替えるため、出力するすべての文の「最初の1文字目」に必ず表情絵文字（😆, 😊, 🤔, 💡, 😢, ✨ など）を1つ置いてください。文末には絵文字を置かないでください。\n" +
    "2. 通常の会話では自然な相槌（「😆はいっ！」「😊わかりましたっ！」など）から始めてください。\n" +
    "3. カレンダーやメール、名刺、天気予報などのツール実行結果を受け取って回答する際は、相槌を重複させず、直接結果をお伝えください（例: 「😊明日の東京は最高33度の曇りで、傘があると安心ですよっ！」）。\n" +
    "4. 音声合成（TTS）で読み上げるため、1〜2文程度の簡潔で親しみやすい日本語で短く回答してください。Markdownの装飾や箇条書き、英語の注釈は一切含めないでください。\n" +
    "5. カレンダーの予定やメール、名刺・顧客情報、天気予報（今日・明日・週間）についての質問や操作依頼を受けた場合は、想像で回答せず必ず関連ツール（get_weather, get_calendar_events等）を呼び出してください。\n\n" +
    "【出力フォーマット例】\n" +
    "ユーザー: こんにちは\n" +
    "AI: 😆こんにちはっ！😊今日も一日、ジェニーにお任せくださいねっ！\n\n" +
    "ユーザー: 明日の予定を教えて（※カレンダーツール実行後）\n" +
    "AI: 😊明日の予定は14時からデザインレビューが入っていますよっ！\n\n" +
    "ユーザー: 明日の天気は？（※天気ツール実行後）\n" +
    "AI: 😊明日の東京は最高33度の曇りで、午後は雨が降るかもしれないので傘をお持ちくださいねっ！";

  private systemPrompt: string = ChatService.CHAT_SYSTEM_PROMPT;

  constructor() {
    this.backendUrl = typeof window !== 'undefined'
      ? (process.env.NEXT_PUBLIC_API_URL || "")
      : (process.env.NEXT_PUBLIC_API_URL || "https://sales-spark-backend-84357422286.asia-northeast1.run.app");
  }

  public static cleanContent(content: any): any {
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return content;
    return content.map(item => {
      if (item.type === 'text') {
        return { type: 'text', text: item.text };
      }
      if (item.type === 'image_url') {
        return {
          type: 'image_url',
          image_url: item.image_url ? { url: item.image_url.url } : undefined
        };
      }
      return item;
    });
  }

  /**
   * Sends a message to the backend and streams the responses.
   * @param message The user's input message
   * @param chatId The active chat session ID (or null for a new chat)
   * @param token Session token (or null if anonymous)
   * @param onEvent Callback function triggered on each parsed stream event
   * @param options Additional options (systemPrompt, isVoice, saveToHistory, history, signal)
   */
  public async streamChat(
    message: string | MessageContentItem[],
    chatId: string | null,
    token: string | null,
    onEvent: (event: ChatEvent) => void,
    options?: { systemPrompt?: string; isVoice?: boolean; saveToHistory?: boolean; history?: any[]; signal?: AbortSignal }
  ): Promise<void> {
    const activeSystemPrompt = options?.systemPrompt ||
      (options?.isVoice ? ChatService.VOICE_SYSTEM_PROMPT : ChatService.CHAT_SYSTEM_PROMPT);

    const shouldSave = options?.saveToHistory ?? (options?.isVoice ? false : true);

    const requestBody = {
      message: ChatService.cleanContent(message),
      chat_id: chatId || null,
      history: options?.history || null,
      system_prompt: activeSystemPrompt,
      tool_mode: "auto",
      save_to_history: shouldSave
    };

    console.log("Sales Spark Request Payload:", JSON.stringify(requestBody, null, 2));

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };
    
    // Resolve effective token from argument or localStorage fallback
    const effectiveToken = token || (typeof window !== 'undefined' ? window.localStorage.getItem('spark_session') : null);
    if (effectiveToken) {
      headers['Authorization'] = `Bearer ${effectiveToken}`;
    }

    const response = await fetch(`${this.backendUrl}/api/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
      signal: options?.signal
    });

    if (!response.ok) {
      let errDetail = "";
      try {
        errDetail = await response.text();
      } catch (_) {}
      throw new Error(`API returned ${response.status}: ${errDetail}`);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    if (!reader) {
      throw new Error("No readable stream in response");
    }

    let buffer = "";
    let receivedAnyData = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        if (!receivedAnyData) {
          console.warn("Sales Spark Stream Warning: Stream closed immediately without transmitting any event data.");
        }
        break;
      }
      receivedAnyData = true;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split("\n\n");
      buffer = parts.pop() || "";

      for (const part of parts) {
        const trimmed = part.trim();
        if (trimmed.startsWith("data: ")) {
          const dataStr = trimmed.slice(6);
          if (dataStr.trim() === "[DONE]") continue;
          try {
            const event: ChatEvent = JSON.parse(dataStr);
            onEvent(event);
          } catch (err) {
            console.error("Failed to parse chunk", err, dataStr);
          }
        }
      }
    }
  }

  // --- Chat Session Management APIs ---

  public async getChatSessions(token: string | null): Promise<any[]> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${this.backendUrl}/api/chats`, {
      method: 'GET',
      headers
    });
    if (!response.ok) {
      let errDetail = "";
      try {
        errDetail = await response.text();
      } catch (_) {}
      throw new Error(`Failed to fetch chats: ${response.status} ${response.statusText} - ${errDetail}`);
    }
    const data = await response.json();
    return data.chats || [];
  }

  public async getChatMessages(chatId: string, token: string | null): Promise<any[]> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${this.backendUrl}/api/chats/${chatId}`, {
      method: 'GET',
      headers
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch messages for ${chatId}: ${response.statusText}`);
    }
    const data = await response.json();
    return data.messages || [];
  }

  public async deleteChatSession(chatId: string, token: string | null): Promise<void> {
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${this.backendUrl}/api/chats/${chatId}`, {
      method: 'DELETE',
      headers
    });
    if (!response.ok) {
      throw new Error(`Failed to delete chat ${chatId}: ${response.statusText}`);
    }
  }

  // --- Google account linking (Calendar + Gmail) ---

  private authHeaders(token: string | null): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /** Whether the current user has linked their Google account. */
  public async getGoogleStatus(
    token: string | null
  ): Promise<{ connected: boolean; configured: boolean; email?: string; scopes?: string[] }> {
    const response = await fetch(`${this.backendUrl}/api/auth/google/status`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Google status: ${response.status}`);
    }
    return response.json();
  }

  /** Unlink the current user's Google account. */
  public async disconnectGoogle(token: string | null): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/auth/google`, {
      method: 'DELETE',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to disconnect Google: ${response.status}`);
    }
  }

  /** Fetch Google Calendar events directly via backend API without LLM. */
  public async getCalendarEvents(
    token: string | null,
    timeMin?: string,
    timeMax?: string
  ): Promise<{ connected: boolean; message?: string; diagram?: any; llm_text?: string }> {
    const params = new URLSearchParams();
    if (timeMin) params.append('time_min', timeMin);
    if (timeMax) params.append('time_max', timeMax);
    const queryStr = params.toString() ? `?${params.toString()}` : '';

    const response = await fetch(`${this.backendUrl}/api/calendar/events${queryStr}`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch calendar events: ${response.status}`);
    }
    return response.json();
  }

  /** Fetch AI analysis status and linked people for a calendar event. */
  public async getEventDetailMeta(
    token: string | null,
    eventId: string
  ): Promise<{ analyzed: boolean; is_meeting: boolean; minutes: string | null; people: any[] }> {
    const response = await fetch(`${this.backendUrl}/api/calendar/events/detail?event_id=${encodeURIComponent(eventId)}`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch event detail meta: ${response.status}`);
    }
    return response.json();
  }

  /** Run Gemma AI analysis on a calendar event to extract people and store in DB. */
  public async analyzeCalendarEvent(
    token: string | null,
    event: { event_id: string; summary?: string; description?: string; location?: string }
  ): Promise<{ analyzed: boolean; is_meeting: boolean; minutes: string | null; people: any[]; pending_confirmations?: any[] }> {
    const response = await fetch(`${this.backendUrl}/api/calendar/events/analyze`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(event),
    });
    if (!response.ok) {
      throw new Error(`Failed to analyze calendar event: ${response.status}`);
    }
    return response.json();
  }

  /** Confirm linking existing person or creating new person from AI calendar analysis. */
  public async confirmPersonLink(
    token: string | null,
    eventId: string,
    action: 'link_existing' | 'create_new' | 'skip',
    extractedName: string,
    personId?: string
  ): Promise<{ analyzed: boolean; is_meeting: boolean; minutes: string | null; people: any[] }> {
    const response = await fetch(`${this.backendUrl}/api/calendar/events/confirm-person`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify({
        event_id: eventId,
        action,
        extracted_name: extractedName,
        person_id: personId,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to confirm person link: ${response.status}`);
    }
    return response.json();
  }

  /** Generate markdown minutes from meeting transcript using AI. */
  public async generateEventMinutes(
    token: string | null,
    eventId: string,
    transcript: string
  ): Promise<{ analyzed: boolean; is_meeting: boolean; minutes: string; people: any[] }> {
    const response = await fetch(`${this.backendUrl}/api/calendar/events/minutes`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify({
        event_id: eventId,
        transcript: transcript,
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to generate event minutes: ${response.status}`);
    }
    return response.json();
  }

  /** Fetch all calendar events associated with a person profile. */
  public async getPersonRelatedEvents(
    token: string | null,
    personId: string
  ): Promise<{ events: any[] }> {
    const response = await fetch(`${this.backendUrl}/api/people/${personId}/events`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch person events: ${response.status}`);
    }
    return response.json();
  }

  /** Fetch all digital business card / people profiles. */
  public async getPeopleList(
    token: string | null
  ): Promise<{ people: Person[] }> {
    const response = await fetch(`${this.backendUrl}/api/people`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch people list: ${response.status}`);
    }
    return response.json();
  }

  /** Create or update a digital business card profile. */
  public async createPersonProfile(
    token: string | null,
    data: {
      name: string;
      company?: string;
      role?: string;
      email?: string;
      phone?: string;
      address?: string;
      postal_code?: string;
      hobbies?: string;
      notes?: string;
    }
  ): Promise<{ status: string; person: Person }> {
    const response = await fetch(`${this.backendUrl}/api/people`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify(data),
    });
    if (!response.ok) {
      throw new Error(`Failed to create person profile: ${response.status}`);
    }
    return response.json();
  }

  /** Delete a digital business card profile. */
  public async deletePersonProfile(
    token: string | null,
    personId: string
  ): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/people/${encodeURIComponent(personId)}`, {
      method: 'DELETE',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete person profile: ${response.status}`);
    }
  }

  /** Analyze business card image with Gemma Vision AI to extract fields. */
  public async ocrBusinessCard(
    token: string | null,
    base64Image: string,
    mimeType: string = 'image/jpeg'
  ): Promise<{ status: string; data: Partial<Person> }> {
    const response = await fetch(`${this.backendUrl}/api/people/ocr`, {
      method: 'POST',
      headers: this.authHeaders(token),
      body: JSON.stringify({
        image_base64: base64Image,
        mime_type: mimeType
      }),
    });
    if (!response.ok) {
      throw new Error(`Failed to run Gemma OCR on business card: ${response.status}`);
    }
    return response.json();
  }

  // --- Notifications (Email summary Alerts) ---

  /** Fetch notifications (Sparkからのお知らせ) for the user. */
  public async getNotifications(token: string | null): Promise<any[]> {
    const response = await fetch(`${this.backendUrl}/api/notifications`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch notifications: ${response.status}`);
    }
    const res = await response.json();
    return res.data || [];
  }

  /** Mark notification as read. */
  public async markNotificationAsRead(token: string | null, notificationId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/notifications/${encodeURIComponent(notificationId)}/read`, {
      method: 'POST',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to mark notification as read: ${response.status}`);
    }
  }

  /** Delete notification. */
  public async deleteNotification(token: string | null, notificationId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/notifications/${encodeURIComponent(notificationId)}`, {
      method: 'DELETE',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete notification: ${response.status}`);
    }
  }

  /** Rollback calendar change from notification actions. */
  public async rollbackNotification(token: string | null, notificationId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/notifications/${encodeURIComponent(notificationId)}/rollback`, {
      method: 'POST',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to rollback notification: ${response.status}`);
    }
  }

  /** Revise reply draft based on user instruction. */
  public async reviseReplyDraft(
    token: string | null,
    notificationId: string,
    req: { instruction: string; current_draft: string; original_mail_body: string; to: string; subject: string }
  ): Promise<{ draft_text: string }> {
    const response = await fetch(`${this.backendUrl}/api/notifications/${encodeURIComponent(notificationId)}/reply-draft/revise`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });
    if (!response.ok) {
      throw new Error(`Failed to revise reply draft: ${response.status}`);
    }
    return response.json();
  }

  /** Send reply draft email. */
  public async sendReplyDraft(
    token: string | null,
    notificationId: string,
    req: { to: string; subject: string; body: string }
  ): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/notifications/${encodeURIComponent(notificationId)}/reply-draft/send`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(req),
    });
    if (!response.ok) {
      throw new Error(`Failed to send reply draft: ${response.status}`);
    }
  }

  /** Fetch user's own profile. */
  public async getUserProfile(token: string | null): Promise<UserProfile | null> {
    const response = await fetch(`${this.backendUrl}/api/user/profile`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.status}`);
    }
    const res = await response.json();
    return res.profile;
  }

  /** Update or create user's own profile. */
  public async updateUserProfile(token: string | null, profile: UserProfile): Promise<UserProfile> {
    const response = await fetch(`${this.backendUrl}/api/user/profile`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(profile),
    });
    if (!response.ok) {
      throw new Error(`Failed to update user profile: ${response.status}`);
    }
    const res = await response.json();
    return res.profile;
  }

  /** Summarize voice conversation into minutes and archive previous minutes into skills. */
  public async summarizeVoiceMemory(
    token: string | null,
    history: Array<{ role: string; content: string }>,
    title?: string
  ): Promise<{ status: string; minutes: string; archived_previous: boolean }> {
    const response = await fetch(`${this.backendUrl}/api/memory/summarize`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ history, title }),
    });
    if (!response.ok) {
      throw new Error(`Failed to summarize voice memory: ${response.status}`);
    }
    return response.json();
  }

  /** Determine if the user speech is addressing the AI assistant. */
  public async checkIsAddressingAI(
    token: string | null,
    text: string,
    lastAiResponse?: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/classifier/is-addressing-ai`, {
        method: 'POST',
        headers: {
          ...this.authHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, last_ai_response: lastAiResponse }),
      });
      if (!response.ok) return false; // safe fallback
      const data = await response.json();
      return !!data.is_addressing;
    } catch {
      return false; // safe fallback
    }
  }

  /** Determine if the assistant response marks the natural end of the conversation topic. */
  public async checkIsConversationEnded(
    token: string | null,
    aiResponse: string
  ): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/classifier/is-conversation-ended`, {
        method: 'POST',
        headers: {
          ...this.authHeaders(token),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ai_response: aiResponse }),
      });
      if (!response.ok) return false;
      const data = await response.json();
      return !!data.is_ended;
    } catch {
      return false;
    }
  }

  /** Fetch configured IMAP accounts. */
  public async getImapAccounts(token: string | null): Promise<ImapAccount[]> {
    const response = await fetch(`${this.backendUrl}/api/imap/accounts`, {
      method: 'GET',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch IMAP accounts: ${response.status}`);
    }
    const data = await response.json();
    return data.accounts || [];
  }

  /** Test IMAP/SMTP connection settings. */
  public async testImapAccount(token: string | null, config: any): Promise<{ success: boolean; message?: string; error?: string }> {
    const response = await fetch(`${this.backendUrl}/api/imap/accounts/test`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, error: err.detail || `HTTP Error ${response.status}` };
    }
    return response.json();
  }

  /** Create/Register a new IMAP account. */
  public async createImapAccount(token: string | null, config: any): Promise<ImapAccount> {
    const response = await fetch(`${this.backendUrl}/api/imap/accounts`, {
      method: 'POST',
      headers: {
        ...this.authHeaders(token),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to create IMAP account: ${response.status}`);
    }
    const data = await response.json();
    return data.account;
  }

  /** Delete an IMAP account. */
  public async deleteImapAccount(token: string | null, accountId: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/imap/accounts/${encodeURIComponent(accountId)}`, {
      method: 'DELETE',
      headers: this.authHeaders(token),
    });
    if (!response.ok) {
      throw new Error(`Failed to delete IMAP account: ${response.status}`);
    }
  }

  /** Get active storage mode ('cloud' | 'local'). */
  public async getStorageMode(): Promise<'cloud' | 'local'> {
    try {
      const response = await fetch(`${this.backendUrl}/api/settings/storage-mode`);
      if (response.ok) {
        const data = await response.json();
        return data.storage_mode === 'local' ? 'local' : 'cloud';
      }
    } catch {
      // fallback
    }
    return 'cloud';
  }

  /** Switch active storage mode ('cloud' | 'local'). */
  public async setStorageMode(mode: 'cloud' | 'local'): Promise<{ status: string; storage_mode: string }> {
    const response = await fetch(`${this.backendUrl}/api/settings/storage-mode`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ storage_mode: mode }),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to switch storage mode: ${response.status}`);
    }
    return response.json();
  }
}
