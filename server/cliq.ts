import fs from 'fs';
import path from 'path';

export interface CliqConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  refreshToken?: string;
  accessToken?: string;
  tokenExpiresAt?: number;
  channelName: string;
  companyId?: string;
  webhookUrl?: string;
  accountsDomain: string; // e.g. 'https://accounts.zoho.in'
  apiDomain: string;      // e.g. 'https://cliq.zoho.in'
}

const TOKEN_FILE_PATH = path.resolve(process.cwd(), '.cliq-token.json');

// In-memory deduplication set
const sentEventsCache = new Set<string>();

class ZohoCliqService {
  private config: CliqConfig;

  constructor() {
    this.config = this.loadConfig();
  }

  private loadConfig(): CliqConfig {
    let savedTokenData: any = {};
    if (fs.existsSync(TOKEN_FILE_PATH)) {
      try {
        savedTokenData = JSON.parse(fs.readFileSync(TOKEN_FILE_PATH, 'utf-8'));
      } catch (err) {
        console.warn('[ZOHO-CLIQ] Could not read .cliq-token.json:', err);
      }
    }

    const accountsDomain = process.env.CLIQ_ACCOUNTS_DOMAIN || 'https://accounts.zoho.in';
    const apiDomain = process.env.CLIQ_API_DOMAIN || 'https://cliq.zoho.in';
    const channelName = process.env.CLIQ_CHANNEL_NAME || 'teaminformation';

    return {
      clientId: process.env.CLIQ_CLIENT_ID || '1000.LBCZOIC81J3EUOS8JHK22L7KL8K4YB',
      clientSecret: process.env.CLIQ_CLIENT_SECRET || '64d170fec789812cad5fc2bf72f7a1b3616d8cb675',
      redirectUri: process.env.CLIQ_REDIRECT_URI || 'http://localhost:5000/api/cliq/callback',
      refreshToken: process.env.CLIQ_REFRESH_TOKEN || savedTokenData.refreshToken,
      accessToken: savedTokenData.accessToken,
      tokenExpiresAt: savedTokenData.tokenExpiresAt,
      channelName,
      companyId: process.env.CLIQ_COMPANY_ID || '60026655235',
      webhookUrl: process.env.CLIQ_WEBHOOK_URL,
      accountsDomain,
      apiDomain,
    };
  }

  public saveTokens(tokens: { accessToken?: string; refreshToken?: string; expiresIn?: number }) {
    if (tokens.refreshToken) {
      this.config.refreshToken = tokens.refreshToken;
    }
    if (tokens.accessToken) {
      this.config.accessToken = tokens.accessToken;
      this.config.tokenExpiresAt = Date.now() + ((tokens.expiresIn || 3600) - 300) * 1000;
    }

    try {
      fs.writeFileSync(
        TOKEN_FILE_PATH,
        JSON.stringify(
          {
            refreshToken: this.config.refreshToken,
            accessToken: this.config.accessToken,
            tokenExpiresAt: this.config.tokenExpiresAt,
            updatedAt: new Date().toISOString(),
          },
          null,
          2
        )
      );
    } catch (err) {
      console.error('[ZOHO-CLIQ] Failed to persist token file:', err);
    }
  }

  public clearTokens() {
    this.config.refreshToken = undefined;
    this.config.accessToken = undefined;
    this.config.tokenExpiresAt = undefined;
    try {
      if (fs.existsSync(TOKEN_FILE_PATH)) {
        fs.unlinkSync(TOKEN_FILE_PATH);
      }
    } catch (e) {
      console.error('[ZOHO-CLIQ] Error removing token file:', e);
    }
  }

  public getAuthUrl(state?: string): string {
    const scopes = [
      'ZohoCliq.Channels.READ',
      'ZohoCliq.Channels.CREATE',
      'ZohoCliq.Messages.CREATE',
      'ZohoCliq.Webhooks.CREATE',
    ].join(',');

    const params = new URLSearchParams({
      scope: scopes,
      client_id: this.config.clientId,
      response_type: 'code',
      access_type: 'offline',
      redirect_uri: this.config.redirectUri,
      prompt: 'consent',
      ...(state ? { state } : {}),
    });

    return `${this.config.accountsDomain}/oauth/v2/auth?${params.toString()}`;
  }

  public async exchangeCodeForToken(code: string): Promise<boolean> {
    try {
      const bodyParams = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
      });

      const response = await fetch(`${this.config.accountsDomain}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      const data = await response.json();
      if (data.error) {
        console.error('[ZOHO-CLIQ] Token exchange error:', data.error);
        return false;
      }

      this.saveTokens({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresIn: data.expires_in,
      });

      console.log('[ZOHO-CLIQ] Successfully authenticated and generated tokens.');
      return true;
    } catch (err) {
      console.error('[ZOHO-CLIQ] Error during authorization code exchange:', err);
      return false;
    }
  }

  private async refreshAccessToken(): Promise<string | null> {
    if (!this.config.refreshToken) {
      console.warn('[ZOHO-CLIQ] No refresh token available. Please authorize via /api/cliq/auth or configure CLIQ_REFRESH_TOKEN.');
      return null;
    }

    try {
      const bodyParams = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: 'refresh_token',
        refresh_token: this.config.refreshToken,
      });

      const response = await fetch(`${this.config.accountsDomain}/oauth/v2/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString(),
      });

      const data = await response.json();
      if (data.error) {
        console.error('[ZOHO-CLIQ] Error refreshing access token:', data);
        return null;
      }

      this.saveTokens({
        accessToken: data.access_token,
        expiresIn: data.expires_in,
      });

      return data.access_token;
    } catch (err) {
      console.error('[ZOHO-CLIQ] Exception during token refresh:', err);
      return null;
    }
  }

  public async getValidAccessToken(): Promise<string | null> {
    if (this.config.accessToken && this.config.tokenExpiresAt && Date.now() < this.config.tokenExpiresAt) {
      return this.config.accessToken;
    }
    return this.refreshAccessToken();
  }

  public async sendMessageToChannel(messageText: string, cardData?: Record<string, any>): Promise<boolean> {
    // 1. If Webhook URL is provided, try webhook first
    if (this.config.webhookUrl) {
      try {
        const botName = process.env.CLIQ_BOT_NAME || "LMS Notifications";
        const payload: any = { 
          text: messageText,
          bot: {
            name: botName,
          }
        };
        if (cardData) payload.card = cardData;

        const res = await fetch(this.config.webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok) {
          console.log('[ZOHO-CLIQ] Message sent via webhook.');
          return true;
        } else {
          const errText = await res.text();
          console.warn('[ZOHO-CLIQ] Webhook post failed:', res.status, errText);
        }
      } catch (err) {
        console.error('[ZOHO-CLIQ] Webhook error:', err);
      }
    }

    // 2. Otherwise use official OAuth API
    const token = await this.getValidAccessToken();
    if (!token) {
      console.warn('[ZOHO-CLIQ] Cannot send message: No valid Zoho Cliq access token available.');
      return false;
    }

    try {
      const channel = encodeURIComponent(this.config.channelName);
      const url = this.config.companyId
        ? `${this.config.apiDomain}/company/${this.config.companyId}/api/v2/channelsbyname/${channel}/message`
        : `${this.config.apiDomain}/api/v2/channelsbyname/${channel}/message`;

      const botName = process.env.CLIQ_BOT_NAME || "LMS Notifications";
      const payload: any = { 
        text: messageText,
        bot: {
          name: botName,
        }
      };
      if (cardData) payload.card = cardData;

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        console.log(`[ZOHO-CLIQ] Message successfully posted to channel #${this.config.channelName}`);
        return true;
      }

      // Handle 401 token expiry retry
      if (res.status === 401) {
        console.log('[ZOHO-CLIQ] Received 401, refreshing token and retrying once...');
        const freshToken = await this.refreshAccessToken();
        if (freshToken) {
          const retryRes = await fetch(url, {
            method: 'POST',
            headers: {
              'Authorization': `Zoho-oauthtoken ${freshToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          });
          return retryRes.ok;
        }
      }

      const resBody = await res.text();
      console.error(`[ZOHO-CLIQ] Failed to post message (status ${res.status}):`, resBody);
      return false;
    } catch (err) {
      console.error('[ZOHO-CLIQ] Error sending message to channel:', err);
      return false;
    }
  }

  public async sendLeaveNotification(leave: {
    id?: string | number;
    employeeName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    appliedDate?: string;
    status: string;
    reason?: string;
    duration?: string;
  }): Promise<boolean> {
    const dedupeKey = `leave_notif_${leave.id || `${leave.employeeName}_${leave.startDate}_${leave.leaveType}`}`;
    if (sentEventsCache.has(dedupeKey)) {
      console.log(`[ZOHO-CLIQ] Duplicate leave notification suppressed for ${dedupeKey}`);
      return true;
    }

    const isOd = (leave.leaveType || '').toUpperCase() === 'OD' || (leave.leaveType || '').toUpperCase().includes('ON DUTY');
    const isOt = (leave.leaveType || '').toUpperCase() === 'OT' || (leave.leaveType || '').toUpperCase().includes('OVERTIME');
    const applicationDate = leave.appliedDate || new Date().toISOString().split('T')[0];
    const durationText = leave.duration ? ` (${leave.duration})` : '';

    const titleHeader = isOd 
      ? `💼 **New On-Duty (OD) Application Submitted**`
      : isOt 
      ? `⏰ **New Overtime (OT) Request Submitted**`
      : `🔔 **New Leave Application Submitted**`;

    const note = isOd ? `\n_📌 Note: On-Duty (OD) implies employee is Present/On Duty, not on leave._` : '';

    const text = [
      `🤖 **[LMS Automated Notification]**`,
      titleHeader,
      `**Employee:** ${leave.employeeName}`,
      `**Type:** ${leave.leaveType}${durationText}`,
      `**Duration:** ${leave.startDate} to ${leave.endDate}`,
      `**Application Date:** ${applicationDate}`,
      `**Current Status:** 🟡 ${leave.status || 'Pending'}`,
      leave.reason ? `**Reason:** ${leave.reason}` : '',
      note,
    ].filter(Boolean).join('\n');

    const card = {
      title: isOd 
        ? `[LMS] On-Duty (OD) Application — ${leave.employeeName}`
        : `[LMS] Leave Application — ${leave.employeeName}`,
      theme: 'modern-inline',
    };

    const success = await this.sendMessageToChannel(text, card);
    if (success) {
      sentEventsCache.add(dedupeKey);
    }
    return success;
  }

  public async sendLeaveStatusUpdate(leave: {
    id: string | number;
    employeeName: string;
    leaveType: string;
    startDate: string;
    endDate: string;
    status: 'Approved' | 'Rejected';
    actionBy: string;
    reason?: string;
  }): Promise<boolean> {
    const dedupeKey = `leave_status_${leave.id}_${leave.status}`;
    if (sentEventsCache.has(dedupeKey)) {
      console.log(`[ZOHO-CLIQ] Duplicate status update suppressed for ${dedupeKey}`);
      return true;
    }

    const isOd = (leave.leaveType || '').toUpperCase() === 'OD' || (leave.leaveType || '').toUpperCase().includes('ON DUTY');
    const typeLabel = isOd ? 'On-Duty (OD)' : 'Leave';
    const icon = leave.status === 'Approved' ? '✅' : '❌';
    const text = [
      `🤖 **[LMS Automated Notification]**`,
      `${icon} **${typeLabel} Application Status Updated: ${leave.status}**`,
      `**Employee:** ${leave.employeeName}`,
      `**Type:** ${leave.leaveType}`,
      `**Dates:** ${leave.startDate} to ${leave.endDate}`,
      `**Status:** ${leave.status}`,
      `**Action By:** ${leave.actionBy}`,
      leave.reason ? `**Comments:** ${leave.reason}` : '',
    ].filter(Boolean).join('\n');

    const card = {
      title: `[LMS] ${typeLabel} ${leave.status} — ${leave.employeeName}`,
      theme: leave.status === 'Approved' ? 'positive' : 'negative',
    };

    const success = await this.sendMessageToChannel(text, card);
    if (success) {
      sentEventsCache.add(dedupeKey);
    }
    return success;
  }

  public async sendPermissionNotification(perm: {
    id?: string | number;
    employeeName: string;
    employeeCode?: string;
    permissionType: string;
    date: string;
    startTime?: string;
    endTime?: string;
    reason?: string;
    status?: string;
    isLOPApplicable?: boolean;
  }): Promise<boolean> {
    const dedupeKey = `perm_notif_${perm.id || `${perm.employeeName}_${perm.date}_${perm.permissionType}`}`;
    if (sentEventsCache.has(dedupeKey)) {
      console.log(`[ZOHO-CLIQ] Duplicate permission notification suppressed for ${dedupeKey}`);
      return true;
    }

    const timeRange = perm.startTime && perm.endTime ? `${perm.startTime} - ${perm.endTime}` : (perm.startTime || 'Not specified');
    const empDisplay = perm.employeeCode ? `${perm.employeeName} (${perm.employeeCode})` : perm.employeeName;

    const text = [
      `🤖 **[LMS Automated Notification]**`,
      `⏱️ **New Permission Request Submitted**`,
      `**Employee:** ${empDisplay}`,
      `**Permission Type:** ${perm.permissionType}`,
      `**Date:** ${perm.date}`,
      `**Time Window:** ${timeRange}`,
      perm.isLOPApplicable ? `**Notice:** ⚠️ Loss of Pay (LOP) Applicable` : '',
      `**Status:** 🟡 ${perm.status || 'Pending Approval'}`,
      perm.reason ? `**Reason:** ${perm.reason}` : '',
    ].filter(Boolean).join('\n');

    const card = {
      title: `[LMS] Permission Request — ${perm.employeeName}`,
      theme: 'modern-inline',
    };

    const success = await this.sendMessageToChannel(text, card);
    if (success) {
      sentEventsCache.add(dedupeKey);
    }
    return success;
  }

  public async sendPermissionStatusUpdate(perm: {
    id: string | number;
    employeeName: string;
    permissionType: string;
    date: string;
    startTime?: string;
    endTime?: string;
    status: 'Approved' | 'Rejected';
    actionBy: string;
    reason?: string;
  }): Promise<boolean> {
    const dedupeKey = `perm_status_${perm.id}_${perm.status}`;
    if (sentEventsCache.has(dedupeKey)) {
      console.log(`[ZOHO-CLIQ] Duplicate permission status update suppressed for ${dedupeKey}`);
      return true;
    }

    const icon = perm.status === 'Approved' ? '✅' : '❌';
    const timeRange = perm.startTime && perm.endTime ? ` (${perm.startTime} - ${perm.endTime})` : '';

    const text = [
      `🤖 **[LMS Automated Notification]**`,
      `${icon} **Permission Request Status Updated: ${perm.status}**`,
      `**Employee:** ${perm.employeeName}`,
      `**Permission Type:** ${perm.permissionType}${timeRange}`,
      `**Date:** ${perm.date}`,
      `**Status:** ${perm.status}`,
      `**Action By:** ${perm.actionBy}`,
      perm.reason ? `**Comments:** ${perm.reason}` : '',
    ].filter(Boolean).join('\n');

    const card = {
      title: `[LMS] Permission ${perm.status} — ${perm.employeeName}`,
      theme: perm.status === 'Approved' ? 'positive' : 'negative',
    };

    const success = await this.sendMessageToChannel(text, card);
    if (success) {
      sentEventsCache.add(dedupeKey);
    }
    return success;
  }

  public isConfigured(): { configured: boolean; hasRefreshToken: boolean; hasWebhook: boolean } {
    return {
      configured: Boolean((this.config.clientId && this.config.clientSecret) || this.config.webhookUrl),
      hasRefreshToken: Boolean(this.config.refreshToken),
      hasWebhook: Boolean(this.config.webhookUrl),
    };
  }
}

export const cliqService = new ZohoCliqService();
