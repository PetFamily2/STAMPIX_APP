const fs = require("fs");

const p = "convex/debug.ts";
let s = fs.readFileSync(p, "utf8");

if (s.includes("export const createDemoMembershipForExternalId")) {
  console.log("SKIP: already exists");
  process.exit(0);
}

const insertAt = s.lastIndexOf("export const createDemoMembershipForMe");
if (insertAt === -1) {
  console.error("FAIL: createDemoMembershipForMe not found (anchor missing)");
  process.exit(1);
}

// append at end of file (safe)
s += `

/**
 * Creates demo business + program + membership for a given externalId.
 * Intended for \`npx convex run\` (no auth identity).
 */
export const createDemoMembershipForExternalId = mutation({
  args: {
    externalId: v.string(),
    fullName: v.optional(v.string()),
  },
  handler: async (ctx, { externalId, fullName }) => {
    const now = Date.now();

    const targetExternalId = String(externalId).trim();
    if (!targetExternalId) throw new Error('INVALID_EXTERNAL_ID');

    let user = await ctx.db
      .query('users')
      .withIndex('by_externalId', (q: any) => q.eq('externalId', targetExternalId))
      .unique();

    if (!user) {
      const userId = await ctx.db.insert('users', {
        externalId: targetExternalId,
        email: undefined,
        phone: undefined,
        fullName: fullName ?? 'Demo Customer',
        avatarUrl: undefined,
        userType: 'free',
        role: 'customer',
        isActive: true,
        subscriptionPlan: 'free',
        subscriptionStatus: 'inactive',
        subscriptionProductId: undefined,
        subscriptionUpdatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      user = await ctx.db.get(userId);
    }

    if (!user) throw new Error('USER_CREATE_FAILED');

    // Prefer existing active program (avoid duplicates)
    const existingProgram = await ctx.db
      .query('loyaltyPrograms')
      .filter((q: any) => q.eq(q.field('isActive'), true))
      .first();

    let businessId = existingProgram?.businessId;
    let programId = existingProgram?._id;

    if (!businessId || !programId) {
      businessId = await ctx.db.insert('businesses', {
        ownerUserId: user._id,
        externalId: \`demo-biz:\${now}\`,
        name: 'Demo Coffee',
        logoUrl: undefined,
        colors: undefined,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.insert('businessStaff', {
        businessId,
        userId: user._id,
        staffRole: 'owner',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      programId = await ctx.db.insert('loyaltyPrograms', {
        businessId,
        title: 'Coffee Club',
        rewardName: 'Free Coffee',
        maxStamps: 10,
        stampIcon: 'coffee',
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const business = businessId ? await ctx.db.get(businessId) : null;
    const businessExternalId = business?.externalId ?? null;
    const businessQrData = businessExternalId ? \`businessExternalId:\${businessExternalId}\` : null;

    const existingMembership = await ctx.db
      .query('memberships')
      .withIndex('by_userId_programId', (q: any) =>
        q.eq('userId', user._id).eq('programId', programId),
      )
      .first();

    if (existingMembership) {
      await ctx.db.patch(existingMembership._id, { isActive: true, updatedAt: now });
      return {
        ok: true,
        alreadyExisted: true,
        userId: user._id,
        userExternalId: targetExternalId,
        membershipId: existingMembership._id,
        businessId,
        programId,
        businessExternalId,
        businessQrData,
      };
    }

    const membershipId = await ctx.db.insert('memberships', {
      userId: user._id,
      businessId,
      programId,
      currentStamps: 0,
      lastStampAt: undefined,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    return {
      ok: true,
      alreadyExisted: false,
      userId: user._id,
      userExternalId: targetExternalId,
      membershipId,
      businessId,
      programId,
      businessExternalId,
      businessQrData,
    };
  },
});
`;

fs.writeFileSync(p, s, "utf8");
console.log("OK: appended createDemoMembershipForExternalId to", p);
