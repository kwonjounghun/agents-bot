import fs from 'fs/promises';
import path from 'path';
import https from 'node:https';
import http from 'node:http';
import { ObsidianConfig } from '../types.js';

// Obsidian Local REST API uses a self-signed HTTPS cert on localhost.
// Node.js native fetch rejects self-signed certs, so we use the http/https
// modules directly with rejectUnauthorized: false.

function apiFetch(
  config: ObsidianConfig,
  urlPath: string,
  method: string,
  body?: string,
): Promise<{ status: number; ok: boolean; text: () => Promise<string> }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(`${config.apiUrl}${urlPath}`);
    const isHttps = parsed.protocol === 'https:';
    const lib = isHttps ? https : http;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
    };
    if (body !== undefined) {
      headers['Content-Type'] = 'text/markdown';
    }

    const req = lib.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? '443' : '80'),
        path: parsed.pathname + parsed.search,
        method,
        headers,
        rejectUnauthorized: false,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
        res.on('end', () => {
          const status = res.statusCode ?? 0;
          resolve({
            status,
            ok: status >= 200 && status < 300,
            text: async () => data,
          });
        });
      },
    );

    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

export class ObsidianClient {
  private config: ObsidianConfig;

  constructor(config: ObsidianConfig) {
    this.config = config;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await apiFetch(this.config, '/', 'GET');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async noteExists(notePath: string): Promise<boolean> {
    try {
      const encoded = encodeURIComponent(notePath).replace(/%2F/g, '/');
      const res = await apiFetch(this.config, `/vault/${encoded}`, 'GET');
      return res.status === 200;
    } catch {
      return false;
    }
  }

  async createNote(notePath: string, content: string): Promise<void> {
    await this._put(notePath, content);
  }

  async updateNote(notePath: string, content: string): Promise<void> {
    await this._put(notePath, content);
  }

  private async _put(notePath: string, content: string): Promise<void> {
    const encoded = encodeURIComponent(notePath).replace(/%2F/g, '/');
    const res = await apiFetch(this.config, `/vault/${encoded}`, 'PUT', content);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Obsidian API error ${res.status}: ${body}`);
    }
  }
}

// Fallback: save to local filesystem when Obsidian is not available
export async function saveToLocal(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf-8');
}
