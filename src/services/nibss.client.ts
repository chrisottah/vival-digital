import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

interface NibssCredentials {
  apiKey: string;
  apiSecret: string;
}

interface LoginResponse {
  token: string;
  fintech: {
    name: string;
    email: string;
    bankCode: string;
    bankName: string;
  };
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}

export class NibssError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public responseBody?: unknown,
  ) {
    super(message);
    this.name = 'NibssError';
  }
}

class NibssClient {
  private http: AxiosInstance;
  private cachedToken: CachedToken | null = null;

  constructor() {
    this.http = axios.create({
      baseURL: env.NIBSS_BASE_URL,
      timeout: 20_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * Authenticate with NIBSS using fintech credentials. Returns a JWT valid
   * for 1 hour. Called lazily — only when we don't have a fresh token.
   */
  private async login(): Promise<CachedToken> {
    const credentials: NibssCredentials = {
      apiKey: env.NIBSS_API_KEY,
      apiSecret: env.NIBSS_API_SECRET,
    };

    try {
      const { data } = await this.http.post<LoginResponse>(
        '/api/auth/token',
        credentials,
      );

      if (!data.token) {
        throw new NibssError('NIBSS login returned no token');
      }

      // Tokens last 1h. Refresh 60s early to avoid edge cases.
      const expiresAt = Date.now() + 60 * 60 * 1000 - 60_000;
      logger.info('[NIBSS] Authenticated, token cached');
      return { token: data.token, expiresAt };
    } catch (err) {
      const axiosErr = err as AxiosError;
      logger.error('[NIBSS] Login failed', axiosErr.response?.data ?? axiosErr.message);
      throw new NibssError(
        'Failed to authenticate with NIBSS',
        axiosErr.response?.status,
        axiosErr.response?.data,
      );
    }
  }

  /**
   * Return a valid cached token, refreshing if expired or near expiry.
   */
  private async getToken(forceRefresh = false): Promise<string> {
    const now = Date.now();
    if (
      !forceRefresh &&
      this.cachedToken &&
      this.cachedToken.expiresAt > now
    ) {
      return this.cachedToken.token;
    }
    this.cachedToken = await this.login();
    return this.cachedToken.token;
  }

  /**
   * Authenticated request wrapper. Handles 401 by refreshing token once.
   */
  async request<T>(config: AxiosRequestConfig, isRetry = false): Promise<T> {
    const token = await this.getToken();
    try {
      const { data } = await this.http.request<T>({
        ...config,
        headers: {
          ...config.headers,
          Authorization: `Bearer ${token}`,
        },
      });
      return data;
    } catch (err) {
      const axiosErr = err as AxiosError;

      // If NIBSS rejects the token (expired/revoked), refresh once and retry
      if (axiosErr.response?.status === 401 && !isRetry) {
        logger.warn('[NIBSS] Got 401, refreshing token and retrying');
        await this.getToken(true);
        return this.request<T>(config, true);
      }

      // Surface everything else as a typed error
      const body = axiosErr.response?.data;
      const message =
        (body as { message?: string })?.message ??
        axiosErr.message ??
        'NIBSS request failed';

      logger.error('[NIBSS] Request failed', {
        url: config.url,
        method: config.method,
        status: axiosErr.response?.status,
        body,
      });

      throw new NibssError(message, axiosErr.response?.status, body);
    }
  }

  /**
   * Public unauthenticated POST (used for onboarding & identity creation,
   * which per the docs don't require a Bearer token).
   */
  async publicPost<T>(url: string, body: unknown): Promise<T> {
    try {
      const { data } = await this.http.post<T>(url, body);
      return data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      const respBody = axiosErr.response?.data;
      const message =
        (respBody as { message?: string })?.message ??
        axiosErr.message ??
        'NIBSS public request failed';
      throw new NibssError(message, axiosErr.response?.status, respBody);
    }
  }
}

export const nibssClient = new NibssClient();