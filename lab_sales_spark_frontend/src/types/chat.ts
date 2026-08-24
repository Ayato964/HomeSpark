export interface Section {
  tag: string;
  label: string;
  headline: string;
  body: string;
  cta?: string;
  cta2?: string;
}

export interface Doc {
  file: string;
  sections: Section[];
  source: string;
}

export interface ToolCall {
  name: string;
  arguments?: any;
  result?: string;
  error?: string;
  status: 'running' | 'success' | 'error';
}

export interface MessageContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
  name?: string;
  mimeType?: string;
}

// --- Custom diagrams: structured JSON a tool returns alongside its text, so
// the frontend can visualize it (instead of dumping raw JSON into the chat). ---
export interface CalendarDiagramEvent {
  id: string;
  summary: string;
  start: string;   // RFC3339 datetime, or YYYY-MM-DD for all-day
  end: string;
  location: string;
  description: string;
  all_day: boolean;
}

// OO Domain Models for Event Context (People & Related Events)
export interface Person {
  id: string;
  name: string;
  role?: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  postal_code?: string;
  hobbies?: string;
  avatarUrl?: string;
  notes?: string;
  created_at?: string;
}

export interface RelatedEvent {
  id: string;
  title: string;
  dateStr: string;
  relationType: 'previous' | 'next' | 'related';
}

export interface EmailDiagramMessage {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface CustomDiagram {
  mode: 'calendar' | 'email_list';
  title?: string;
  query?: string;
  events?: CalendarDiagramEvent[];      // mode === 'calendar'
  messages?: EmailDiagramMessage[];     // mode === 'email_list'
}

export interface Message {
  role: "user" | "spark";
  text: string | MessageContentItem[];
  time: string;
  doc?: boolean;
  toolCalls?: ToolCall[];
  diagrams?: CustomDiagram[];
}

export interface Convo {
  id: string;
  title: string;
  time: string;
  doc: Doc | null;
  messages: Message[];
  apiHistory?: any[];
}

export interface ChatEvent {
  type: 'token' | 'tool_start' | 'tool_end' | 'tool_error' | 'done' | 'error' | 'chat_info' | 'custom_diagram';
  content?: string;
  name?: string;
  arguments?: any;
  result?: string;
  error?: string;
  final_content?: string;
  memory?: any[];
  chat_id?: string;
  diagram?: CustomDiagram;
}

export interface SparkNotificationAction {
  label: string;
  type: 'reply_draft' | 'calendar_add' | 'snooze' | 'rollback_calendar';
  metadata?: {
    to?: string;
    subject?: string;
    original_body?: string;
    draft_text?: string;
    summary?: string;
    start?: string;
    end?: string;
    action_type?: 'create' | 'update';
    event_id?: string;
    person_id?: string;
    person_name?: string;
    old_data?: {
      summary?: string;
      start?: string;
      end?: string;
      description?: string;
    };
  };
}

export interface SparkNotification {
  id: string;
  category: 'notification' | 'decision';
  title: string;
  content: string;
  actions: SparkNotificationAction[];
  is_read: boolean;
  created_at: string;
}

export interface UserProfile {
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


