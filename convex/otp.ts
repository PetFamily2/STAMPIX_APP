import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalMutation, internalQuery, mutation } from './_generated/server';

const OTP_LENGTH = 6;
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_COOLDOWN_MS = 30 * 1000;
const OTP_MAX_ATTEMPTS = 5;

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function generateOtpCode() {
  return Array.from(
    { length: OTP_LENGTH },
    () => Math.floor(Math.random() * 10).toString()
  ).join('');
}

export const storeEmailOtp = internalMutation({
  args: {
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, { email, code, expiresAt }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query('emailOtps')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();

    await Promise.all(
      existing
        .filter(
          (item) =>
            item.status === 'pending' || item.status === 'sent'
        )
        .map((item) =>
          ctx.db.patch(item._id, {
            status: 'invalidated',
          })
        )
    );

    return await ctx.db.insert('emailOtps', {
      email,
      code,
      status: 'pending',
      attempts: 0,
      maxAttempts: OTP_MAX_ATTEMPTS,
      expiresAt,
      createdAt: now,
    });
  },
});

export const markEmailOtpSent = internalMutation({
  args: {
    otpId: v.id('emailOtps'),
  },
  handler: async (ctx, { otpId }) => {
    await ctx.db.patch(otpId, {
      status: 'sent',
      sentAt: Date.now(),
    });
  },
});

export const markEmailOtpFailed = internalMutation({
  args: {
    otpId: v.id('emailOtps'),
    reason: v.string(),
  },
  handler: async (ctx, { otpId, reason }) => {
    await ctx.db.patch(otpId, {
      status: 'failed',
      failureReason: reason,
    });
  },
});

export const sendEmailOtp = action({
  args: {
    email: v.string(),
  },
  handler: async (ctx, { email }) => {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail.includes('@')) {
      throw new Error('INVALID_EMAIL');
    }

    const now = Date.now();
    const recentOtps = await ctx.runQuery(internal.otp.getRecentOtpsByEmail, {
      email: normalizedEmail,
    });
    const latestSent = recentOtps.find(
      (item) =>
        item.status === 'sent' &&
        item.createdAt >= now - OTP_COOLDOWN_MS &&
        item.expiresAt > now
    );

    if (latestSent) {
      throw new Error('RATE_LIMITED');
    }

    const code = generateOtpCode();
    const expiresAt = now + OTP_TTL_MS;
    const otpId = await ctx.runMutation(internal.otp.storeEmailOtp, {
      email: normalizedEmail,
      code,
      expiresAt,
    });

    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
      await ctx.runMutation(internal.otp.markEmailOtpFailed, {
        otpId,
        reason: 'MISSING_EMAIL_CONFIG',
      });
      throw new Error('OTP_NOT_CONFIGURED');
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [normalizedEmail],
        subject: 'קוד אימות ל-Stampix',
        html: `<div dir="rtl" style="font-family: Arial, sans-serif; color:#0f172a;">
<p>הקוד שלך הוא:</p>
<p style="font-size:28px;font-weight:800;letter-spacing:4px;margin:8px 0;">${code}</p>
<p>תוקף הקוד: 10 דקות.</p>
</div>`,
      }),
    });

    if (!response.ok) {
      await ctx.runMutation(internal.otp.markEmailOtpFailed, {
        otpId,
        reason: `RESEND_${response.status}`,
      });
      throw new Error('EMAIL_SEND_FAILED');
    }

    await ctx.runMutation(internal.otp.markEmailOtpSent, { otpId });

    return {
      ok: true,
      expiresAt,
      cooldownMs: OTP_COOLDOWN_MS,
    };
  },
});

export const getRecentOtpsByEmail = internalQuery({
  args: {
    email: v.string(),
  },
  handler: async (ctx, { email }) => {
    const rows = await ctx.db
      .query('emailOtps')
      .withIndex('by_email', (q) => q.eq('email', email))
      .collect();

    return rows
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map((row) => ({
        _id: row._id,
        status: row.status,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      }));
  },
});

export const verifyEmailOtp = mutation({
  args: {
    email: v.string(),
    code: v.string(),
  },
  handler: async (ctx, { email, code }) => {
    const normalizedEmail = normalizeEmail(email);
    const submittedCode = code.trim();
    if (!/^\d{6}$/.test(submittedCode)) {
      throw new Error('OTP_INVALID');
    }

    const now = Date.now();
    const rows = await ctx.db
      .query('emailOtps')
      .withIndex('by_email', (q) => q.eq('email', normalizedEmail))
      .collect();

    const active = rows
      .filter(
        (row) =>
          row.status === 'sent' &&
          !row.consumedAt &&
          row.expiresAt > now
      )
      .sort((a, b) => b.createdAt - a.createdAt)[0];

    if (!active) {
      throw new Error('OTP_NOT_FOUND');
    }

    if (active.attempts >= active.maxAttempts) {
      await ctx.db.patch(active._id, {
        status: 'failed',
        failureReason: 'MAX_ATTEMPTS_REACHED',
      });
      throw new Error('OTP_MAX_ATTEMPTS');
    }

    if (active.code !== submittedCode) {
      const nextAttempts = active.attempts + 1;
      await ctx.db.patch(active._id, {
        attempts: nextAttempts,
        status: nextAttempts >= active.maxAttempts ? 'failed' : active.status,
        failureReason:
          nextAttempts >= active.maxAttempts ? 'MAX_ATTEMPTS_REACHED' : undefined,
      });
      throw new Error('OTP_INVALID');
    }

    await ctx.db.patch(active._id, {
      status: 'consumed',
      consumedAt: now,
      attempts: active.attempts + 1,
    });

    return { ok: true };
  },
});
