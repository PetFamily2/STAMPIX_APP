const fs = require("fs");

const p = "app/(authenticated)/_layout.tsx";
let s = fs.readFileSync(p, "utf8");

if (s.includes('name="join"')) {
  console.log("SKIP: join already exists in tabs layout");
  process.exit(0);
}

const marker = "{/* Hide everything else from the tab bar */}";
if (!s.includes(marker)) {
  console.error("FAIL: could not find hide marker in tabs layout");
  process.exit(1);
}

const insert =
  marker +
  '\n      <Tabs.Screen name="join" options={{ href: null, tabBarStyle: { display: "none" } }} />';

s = s.replace(marker, insert);
fs.writeFileSync(p, s, "utf8");
console.log("OK: patched", p);
