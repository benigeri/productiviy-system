// Telegram API types
export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
}

export interface TelegramChat {
  id: number;
  type: string;
}

export interface TelegramVoice {
  file_id: string;
  file_unique_id: string;
  duration: number;
  mime_type?: string;
  file_size?: number;
}

export interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  voice?: TelegramVoice;
  photo?: TelegramPhoto[];
}

export interface WebhookUpdate {
  update_id: number;
  message?: TelegramMessage;
}

export interface ParsedMessage {
  type: "text" | "voice";
  content: string;
  messageId: number;
}

export function parseWebhookUpdate(body: WebhookUpdate): ParsedMessage {
  const message = body.message;
  if (!message) {
    throw new Error("No message in update");
  }

  if (message.text !== undefined) {
    return {
      type: "text",
      content: message.text,
      messageId: message.message_id,
    };
  }

  if (message.voice) {
    return {
      type: "voice",
      content: message.voice.file_id,
      messageId: message.message_id,
    };
  }

  throw new Error("Unsupported message type");
}

export async function getFileUrl(
  fileId: string,
  botToken: string,
  fetchFn: typeof fetch = fetch
): Promise<string> {
  const response = await fetchFn(
    `https://api.telegram.org/bot${botToken}/getFile?file_id=${fileId}`
  );
  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Telegram API error: ${data.description}`);
  }

  return `https://api.telegram.org/file/bot${botToken}/${data.result.file_path}`;
}

export function validateWebhookSecret(
  headers: Headers,
  expectedSecret: string | undefined
): boolean {
  if (expectedSecret === undefined) {
    return true;
  }

  const providedSecret = headers.get("X-Telegram-Bot-Api-Secret-Token");
  return providedSecret === expectedSecret;
}
