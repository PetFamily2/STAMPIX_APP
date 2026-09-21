import { v } from 'convex/values';

import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { SUPPORT_RETENTION_MS } from './dataRetention';
import { requireCurrentUser } from './guards';
import { escapeHtml, normalizeEmailAddress } from './lib/email';

const SUPPORT_MESSAGE_MAX_LENGTH = 1200;
const MISSING_VALUE = 'לא צוין';

function resolveDisplayName(user: Doc<'users'>) {
  const fullName = user.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  const first = user.firstName?.trim() ?? '';
  const last = user.lastName?.trim() ?? '';
  const composed = `${first} ${last}`.trim();
  if (composed) {
    return composed;
  }

  const emailPrefix = user.email?.split('@')[0]?.trim();
  if (emailPrefix) {
    return emailPrefix;
  }

  return 'StampAix User';
}

function normalizeSupportMessage(value: string) {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length === 0) {
    throw new Error('MESSAGE_REQUIRED');
  }
  if (normalized.length > SUPPORT_MESSAGE_MAX_LENGTH) {
    throw new Error('MESSAGE_TOO_LONG');
  }
  return normalized;
}

function requireAdmin(user: Doc<'users'>) {
  if (user.isAdmin !== true) {
    throw new Error('NOT_AUTHORIZED');
  }
}

function parseRecipientList(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.includes('@'));
}

function formatSupportTimestamp(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      hour12: false,
    });
  } catch {
    return new Date(timestamp).toISOString();
  }
}

function displayValue(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : MISSING_VALUE;
}

function sanitizeFailureReason(error: unknown) {
  if (typeof error === 'string' && error.length > 0) {
    return error.slice(0, 120);
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message.replace(/\s+/g, ' ').trim().slice(0, 120);
  }
  return 'UNKNOWN';
}

function reportSupportEmailFailure(
  requestId: Id<'supportRequests'> | string,
  reason: string
) {
  console.error(
    JSON.stringify({
      event: 'SUPPORT_EMAIL_FAILED',
      requestId: String(requestId),
      reason,
    })
  );
}

function buildSupportEmailBodies(payload: {
  requestId: string;
  userId: string;
  name: string;
  email: string;
  phone: string;
  businessLine: string;
  timestampLabel: string;
  isoTimestamp: string;
  message: string;
}) {
  const text = [
    'פניית תמיכה חדשה ב-StampAix',
    `מזהה פנייה: ${payload.requestId}`,
    `מזהה משתמש: ${payload.userId}`,
    `שם: ${payload.name}`,
    `אימייל: ${payload.email}`,
    `טלפון: ${payload.phone}`,
    `עסק: ${payload.businessLine}`,
    `זמן: ${payload.timestampLabel}`,
    `ISO: ${payload.isoTimestamp}`,
    '',
    'הודעה:',
    payload.message,
  ].join('\n');

  const html = `<div dir="rtl" style="font-family: Arial, sans-serif; color:#0f172a; line-height:1.6;">
<h2 style="margin:0 0 12px;">פניית תמיכה חדשה ב-StampAix</h2>
<table style="width:100%; border-collapse:collapse; font-size:14px;">
<tr><td style="padding:6px 0; color:#64748B;">מזהה פנייה</td><td style="padding:6px 0;">${escapeHtml(payload.requestId)}</td></tr>
<tr><td style="padding:6px 0; color:#64748B;">מזהה משתמש</td><td style="padding:6px 0;">${escapeHtml(payload.userId)}</td></tr>
<tr><td style="padding:6px 0; color:#64748B;">שם</td><td style="padding:6px 0;">${escapeHtml(payload.name)}</td></tr>
<tr><td style="padding:6px 0; color:#64748B;">אימייל</td><td style="padding:6px 0;">${escapeHtml(payload.email)}</td></tr>
<tr><td style="padding:6px 0; color:#64748B;">טלפון</td><td style="padding:6px 0;">${escapeHtml(payload.phone)}</td></tr>
<tr><td style="padding:6px 0; color:#64748B;">עסק</td><td style="padding:6px 0;">${escapeHtml(payload.businessLine)}</td></tr>
<tr><td style="padding:6px 0; color:#64748B;">זמן</td><td style="padding:6px 0;">${escapeHtml(payload.timestampLabel)} (${escapeHtml(payload.isoTimestamp)})</td></tr>
</table>
<p style="margin:16px 0 6px; font-weight:700;">הודעה</p>
<p style="white-space:pre-wrap; margin:0;">${escapeHtml(payload.message).replace(/\n/g, '<br />')}</p>
</div>`;

  return { text, html };
}

export const sendSupportRequest = mutation({
  args: {
    message: v.string(),
  },
  handler: async (ctx, { message }) => {
    const user = await requireCurrentUser(ctx);
    const normalizedMessage = normalizeSupportMessage(message);
    const timestamp = Date.now();

    const requestId = await ctx.db.insert('supportRequests', {
      userId: user._id,
      name: resolveDisplayName(user),
      email: normalizeEmailAddress(user.email) ?? undefined,
      phone: user.phone?.trim() || undefined,
      message: normalizedMessage,
      status: 'new',
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    try {
      await ctx.scheduler.runAfter(
        0,
        internal.support.sendSupportRequestEmail,
        { requestId }
      );
    } catch (error) {
      reportSupportEmailFailure(
        requestId,
        `SCHEDULE_${sanitizeFailureReason(error)}`
      );
    }

    return {
      requestId,
      status: 'new' as const,
      createdAt: timestamp,
    };
  },
});

export const getSupportRequestEmailPayload = internalQuery({
  args: {
    requestId: v.id('supportRequests'),
  },
  handler: async (ctx, { requestId }) => {
    const request = await ctx.db.get(requestId);
    if (!request) {
      return null;
    }

    const user = await ctx.db.get(request.userId);
    let businessId: string | null = null;
    let businessName: string | null = null;
    const activeBusinessId = user?.activeBusinessId;
    if (activeBusinessId) {
      const business = await ctx.db.get(activeBusinessId);
      if (business) {
        businessId = String(business._id);
        businessName = business.name?.trim() || null;
      }
    }

    return {
      requestId: String(request._id),
      userId: String(request.userId),
      name: request.name,
      email: request.email ?? null,
      phone: request.phone ?? null,
      message: request.message,
      createdAt: request.createdAt,
      activeMode: user?.activeMode ?? null,
      businessId,
      businessName,
    };
  },
});

export const sendSupportRequestEmail = internalAction({
  args: {
    requestId: v.id('supportRequests'),
  },
  handler: async (ctx, { requestId }) => {
    const payload = await ctx.runQuery(
      internal.support.getSupportRequestEmailPayload,
      { requestId }
    );
    if (!payload) {
      reportSupportEmailFailure(requestId, 'REQUEST_NOT_FOUND');
      return;
    }

    const apiKey = process.env.RESEND_API_KEY?.trim();
    const from = process.env.SUPPORT_EMAIL_FROM?.trim();
    const recipients = parseRecipientList(process.env.SUPPORT_EMAIL_TO);
    if (!apiKey || !from || recipients.length === 0) {
      reportSupportEmailFailure(requestId, 'MISSING_EMAIL_CONFIG');
      return;
    }

    const businessLine = [
      payload.businessName,
      payload.businessId,
      payload.activeMode,
    ]
      .filter((part) => typeof part === 'string' && part.trim().length > 0)
      .join(' · ');

    const bodies = buildSupportEmailBodies({
      requestId: payload.requestId,
      userId: payload.userId,
      name: displayValue(payload.name),
      email: displayValue(payload.email),
      phone: displayValue(payload.phone),
      businessLine: businessLine || MISSING_VALUE,
      timestampLabel: formatSupportTimestamp(payload.createdAt),
      isoTimestamp: new Date(payload.createdAt).toISOString(),
      message: payload.message,
    });

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject: `פניית תמיכה חדשה — ${payload.requestId}`,
          text: bodies.text,
          html: bodies.html,
        }),
      });

      if (!response.ok) {
        reportSupportEmailFailure(requestId, `RESEND_${response.status}`);
      }
    } catch (error) {
      reportSupportEmailFailure(requestId, sanitizeFailureReason(error));
    }
  },
});

export const listSupportRequests = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireCurrentUser(ctx);
    requireAdmin(user);

    const requests = await ctx.db.query('supportRequests').collect();

    return requests.sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const setSupportRequestStatus = mutation({
  args: {
    requestId: v.id('supportRequests'),
    status: v.union(v.literal('new'), v.literal('handled')),
  },
  handler: async (ctx, { requestId, status }) => {
    const user = await requireCurrentUser(ctx);
    requireAdmin(user);

    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }

    const now = Date.now();
    const closedAt =
      status === 'handled' ? (request.closedAt ?? now) : undefined;
    await ctx.db.patch(requestId, {
      status,
      closedAt,
      purgeAfter:
        status === 'handled' && closedAt !== undefined
          ? closedAt + SUPPORT_RETENTION_MS
          : undefined,
      updatedAt: now,
    });

    return requestId;
  },
});

export const setSupportRequestLegalHold = mutation({
  args: {
    requestId: v.id('supportRequests'),
    legalHold: v.boolean(),
  },
  handler: async (ctx, { requestId, legalHold }) => {
    const user = await requireCurrentUser(ctx);
    requireAdmin(user);
    const request = await ctx.db.get(requestId);
    if (!request) {
      throw new Error('REQUEST_NOT_FOUND');
    }
    const now = Date.now();
    await ctx.db.patch(requestId, {
      legalHold,
      purgeAfter:
        legalHold || request.status !== 'handled'
          ? undefined
          : (request.closedAt ?? now) + SUPPORT_RETENTION_MS,
      updatedAt: now,
    });
    return requestId;
  },
});
