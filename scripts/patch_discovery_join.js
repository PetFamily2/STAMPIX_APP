const fs = require("fs");

const p = "app/(authenticated)/discovery.tsx";
let s = fs.readFileSync(p, "utf8");

// add router import if missing
if (s.indexOf('import { router } from "expo-router";') === -1) {
  s = s.replace(
    'import { Ionicons } from "@expo/vector-icons";',
    'import { Ionicons } from "@expo/vector-icons";\nimport { router } from "expo-router";'
  );
}

// patch ONLY the join button onPress near the "הצטרף למועדון" text
const marker = "הצטרף למועדון";
const idx = s.indexOf(marker);
if (idx === -1) {
  console.error("FAIL: cannot find join button text");
  process.exit(1);
}

const before = s.slice(0, idx);
const target = "onPress={() => {}}";
const last = before.lastIndexOf(target);
if (last === -1) {
  console.error("FAIL: cannot find onPress stub before join button");
  process.exit(1);
}

s = s.slice(0, last) + 'onPress={() => router.push("/(authenticated)/join")}' + s.slice(last + target.length);

fs.writeFileSync(p, s, "utf8");
console.log("OK: patched", p);
