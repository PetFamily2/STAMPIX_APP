const fs = require("fs");

const p = "convex/seed.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes("export const seedMvp")) {
  console.error("FAIL: seedMvp not found");
  process.exit(1);
}

if (s.includes("debugVersion:")) {
  console.log("SKIP: debugVersion already exists");
  process.exit(0);
}

// insert debugVersion right after "return {"
s = s.replace(
  "    return {\n",
  "    return {\n      debugVersion: 'seedMvp-debug-v1',\n"
);

fs.writeFileSync(p, s, "utf8");
console.log("OK: patched", p);
