import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import { decrypt, encrypt } from "./encrypt";
import { createClient } from "@/lib/supabase/server";

export interface ParsedMessage {
  id: string;
  threadId: string;
  fromAddress: string;
  fromName: string;
  toAddress: string;
  subject: string;
  snippet: string;
  bodyText: string;
  bodyHtml: string;
  receivedAt: Date;
}

interface ConnectionRow {
  id: string;
  user_id: string;
  email_address: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
  history_id: string | null;
}

export class GmailClient {
  private connection: ConnectionRow;
  private auth: OAuth2Client;

  constructor(connection: ConnectionRow) {
    this.connection = connection;
    this.auth = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID!,
      process.env.GOOGLE_CLIENT_SECRET!,
      process.env.GOOGLE_REDIRECT_URI!
    );
    this.auth.setCredentials({
      access_token: decrypt(connection.access_token),
      refresh_token: connection.refresh_token ? decrypt(connection.refresh_token) : undefined,
      expiry_date: connection.token_expires_at
        ? new Date(connection.token_expires_at).getTime()
        : undefined,
    });
  }

  async refreshTokenIfExpired(): Promise<void> {
    const expiry = this.connection.token_expires_at
      ? new Date(this.connection.token_expires_at).getTime()
      : 0;
    if (expiry > Date.now() + 60_000) return;

    const { credentials } = await this.auth.refreshAccessToken();
    const supabase = await createClient();
    await supabase
      .from("email_connections")
      .update({
        access_token: encrypt(credentials.access_token ?? ""),
        token_expires_at: credentials.expiry_date
          ? new Date(credentials.expiry_date).toISOString()
          : null,
      })
      .eq("id", this.connection.id);
  }

  async listMessages(query: string, pageToken?: string) {
    await this.refreshTokenIfExpired();
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.list({
      userId: "me",
      q: query,
      pageToken,
      maxResults: 100,
    });
    return {
      messages: res.data.messages ?? [],
      nextPageToken: res.data.nextPageToken ?? null,
    };
  }

  async getMessage(id: string): Promise<ParsedMessage | null> {
    await this.refreshTokenIfExpired();
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.messages.get({
      userId: "me",
      id,
      format: "full",
    });
    return parseMessage(res.data);
  }

  async listHistory(startHistoryId: string) {
    await this.refreshTokenIfExpired();
    const gmail = google.gmail({ version: "v1", auth: this.auth });
    const res = await gmail.users.history.list({
      userId: "me",
      startHistoryId,
      historyTypes: ["messageAdded"],
    });
    const messageIds: string[] = [];
    for (const h of res.data.history ?? []) {
      for (const m of h.messagesAdded ?? []) {
        if (m.message?.id) messageIds.push(m.message.id);
      }
    }
    return { messageIds, newHistoryId: res.data.historyId ?? startHistoryId };
  }
}

function parseMessage(msg: any): ParsedMessage | null {
  if (!msg?.payload) return null;
  const headers: Record<string, string> = {};
  for (const h of msg.payload.headers ?? []) {
    headers[h.name.toLowerCase()] = h.value;
  }

  const from = headers["from"] ?? "";
  const { address: fromAddress, name: fromName } = parseEmailAddress(from);
  const toRaw = headers["to"] ?? "";
  const { address: toAddress } = parseEmailAddress(toRaw);

  const { text: bodyText, html: bodyHtml } = extractBody(msg.payload);

  return {
    id: msg.id,
    threadId: msg.threadId ?? "",
    fromAddress,
    fromName,
    toAddress,
    subject: headers["subject"] ?? "",
    snippet: msg.snippet ?? "",
    bodyText,
    bodyHtml,
    receivedAt: new Date(Number(msg.internalDate)),
  };
}

function parseEmailAddress(raw: string): { address: string; name: string } {
  const match = raw.match(/^(.*?)\s*<(.+?)>\s*$/);
  if (match) {
    return { name: match[1].replace(/"/g, "").trim(), address: match[2].trim() };
  }
  return { name: "", address: raw.trim() };
}

function extractBody(payload: any): { text: string; html: string } {
  let text = "";
  let html = "";

  function walk(part: any) {
    const mime = part.mimeType ?? "";
    const data = part.body?.data;
    if (data) {
      const decoded = Buffer.from(data, "base64url").toString("utf-8");
      if (mime === "text/plain") text = decoded;
      else if (mime === "text/html") html = decoded;
    }
    for (const sub of part.parts ?? []) walk(sub);
  }

  walk(payload);
  return { text, html };
}
