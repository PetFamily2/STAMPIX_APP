const fs = require("fs");

const p = "convex/debug.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes("export const createDemoMembershipForMe")) {
  console.error("FAIL: createDemoMembershipForMe not found");
  process.exit(1);
}

// add: load business externalId + qr payload, and include them in both returns
if (!s.includes("businessExternalId:") && s.includes("createDemoMembershipForMe")) {
  // inject helper block just before first return (alreadyExisted branch)
  s = s.replace(
    "    if (existingMembership) {",
    "    const business = businessId ? await ctx.db.get(businessId) : null;\n" +
    "    const businessExternalId = business?.externalId ?? null;\n" +
    "    const businessQrData = businessExternalId ? `businessExternalId:${businessExternalId}` : null;\n\n" +
    "    if (existingMembership) {"
  );

  // patch alreadyExisted return
  s = s.replace(
    "      return { ok: true, membershipId: existingMembership._id, businessId, programId, alreadyExisted: true };",
    "      return { ok: true, membershipId: existingMembership._id, businessId, programId, alreadyExisted: true, businessExternalId, businessQrData };"
  );

  // patch new membership return
  s = s.replace(
    "    return { ok: true, membershipId, businessId, programId, alreadyExisted: false };",
    "    return { ok: true, membershipId, businessId, programId, alreadyExisted: false, businessExternalId, businessQrData };"
  );

  fs.writeFileSync(p, s, "utf8");
  console.log("OK: patched", p);
} else {
  console.log("SKIP: looks already patched");
}
