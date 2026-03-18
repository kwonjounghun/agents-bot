/**
 * Claude Usage Service
 *
 * Fetches Claude Code usage data via the undocumented OAuth Usage API.
 * Reads credentials from ~/.claude/.credentials.json or macOS Keychain.
 *
 * Based on reverse-engineering from https://github.com/robinebers/openusage
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import https from 'https';

const CRED_FILE = path.join(os.homedir(), '.claude', '.credentials.json');
const USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const REFRESH_URL = 'https://platform.claude.com/v1/oauth/token';
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
const SCOPES = 'user:profile user:inference user:sessions:claude_code user:mcp_servers';
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface UsageWindow {
  utilization: number;
  resets_at: string;
}

export interface ExtraUsage {
  is_enabled: boolean;
  used_credits: number;
  monthly_limit: number;
  currency?: string;
}

export interface ClaudeUsageData {
  five_hour?: UsageWindow;
  seven_day?: UsageWindow;
  seven_day_sonnet?: UsageWindow;
  seven_day_opus?: UsageWindow;
  extra_usage?: ExtraUsage;
}

export interface UsageResult {
  success: boolean;
  data?: ClaudeUsageData;
  plan?: string;
  error?: string;
}

interface OAuthCredentials {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  subscriptionType?: string;
  rateLimitTier?: string;
}

interface CredentialsFile {
  claudeAiOauth?: OAuthCredentials;
}

function loadCredentials(): { oauth: OAuthCredentials; fullData: CredentialsFile } | null {
  // Try file first
  if (fs.existsSync(CRED_FILE)) {
    try {
      const text = fs.readFileSync(CRED_FILE, 'utf-8');
      const parsed: CredentialsFile = JSON.parse(text);
      if (parsed.claudeAiOauth?.accessToken) {
        return { oauth: parsed.claudeAiOauth, fullData: parsed };
      }
    } catch {
      // ignore read/parse failure
    }
  }

  // macOS Keychain fallback
  if (process.platform === 'darwin') {
    try {
      const raw = execSync(
        'security find-generic-password -s "Claude Code-credentials" -w',
        { encoding: 'utf-8', timeout: 5000 }
      ).trim();

      let parsed: CredentialsFile | null = null;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Might be hex-encoded
        if (/^[0-9a-fA-F]+$/.test(raw) && raw.length % 2 === 0) {
          const bytes = Buffer.from(raw, 'hex');
          parsed = JSON.parse(bytes.toString('utf-8'));
        }
      }

      if (parsed?.claudeAiOauth?.accessToken) {
        return { oauth: parsed.claudeAiOauth, fullData: parsed };
      }
    } catch {
      // Keychain not available or item not found
    }
  }

  return null;
}

function needsRefresh(oauth: OAuthCredentials): boolean {
  if (!oauth.expiresAt) return false;
  return Date.now() >= oauth.expiresAt - REFRESH_BUFFER_MS;
}

function httpsRequest(options: {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(options.url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: options.method,
        headers: options.headers,
        timeout: 15000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, body: data }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function refreshToken(oauth: OAuthCredentials): Promise<string | null> {
  if (!oauth.refreshToken) return null;

  try {
    const resp = await httpsRequest({
      url: REFRESH_URL,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: oauth.refreshToken,
        client_id: CLIENT_ID,
        scope: SCOPES,
      }),
    });

    if (resp.status === 400 || resp.status === 401) {
      return null;
    }

    const body = JSON.parse(resp.body);
    if (!body.access_token) return null;

    // Update in-memory credentials
    oauth.accessToken = body.access_token;
    if (body.refresh_token) oauth.refreshToken = body.refresh_token;
    if (typeof body.expires_in === 'number') {
      oauth.expiresAt = Date.now() + body.expires_in * 1000;
    }

    // Persist updated credentials
    try {
      const fullData = JSON.parse(fs.readFileSync(CRED_FILE, 'utf-8'));
      fullData.claudeAiOauth = oauth;
      fs.writeFileSync(CRED_FILE, JSON.stringify(fullData));
    } catch {
      // Non-critical: credential persistence failed
    }

    return body.access_token;
  } catch {
    return null;
  }
}

async function fetchUsage(accessToken: string): Promise<{ status: number; body: string }> {
  return httpsRequest({
    url: USAGE_URL,
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'anthropic-beta': 'oauth-2025-04-20',
    },
  });
}

export async function getClaudeUsage(): Promise<UsageResult> {
  const creds = loadCredentials();
  if (!creds) {
    return { success: false, error: 'Not logged in. Run `claude` to authenticate.' };
  }

  let accessToken = creds.oauth.accessToken;

  // Proactively refresh if needed
  if (needsRefresh(creds.oauth)) {
    const refreshed = await refreshToken(creds.oauth);
    if (refreshed) accessToken = refreshed;
  }

  try {
    let resp = await fetchUsage(accessToken);

    // Retry once with refresh on 401
    if (resp.status === 401) {
      const refreshed = await refreshToken(creds.oauth);
      if (refreshed) {
        resp = await fetchUsage(refreshed);
      }
    }

    if (resp.status < 200 || resp.status >= 300) {
      return { success: false, error: `HTTP ${resp.status}` };
    }

    const data: ClaudeUsageData = JSON.parse(resp.body);

    // Extract plan info
    let plan: string | undefined;
    if (creds.oauth.subscriptionType) {
      plan = creds.oauth.subscriptionType.charAt(0).toUpperCase() +
        creds.oauth.subscriptionType.slice(1);
      const tierMatch = String(creds.oauth.rateLimitTier || '').match(/(\d+)x/);
      if (tierMatch) plan += ` ${tierMatch[1]}x`;
    }

    return { success: true, data, plan };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : 'Unknown error',
    };
  }
}
