const fs = require("fs");

const path = "convex/seed.ts";
let s = fs.readFileSync(path, "utf8");

// 1) business externalId יציב במקום timestamp
s = s.replace(/externalId:\s*`biz:\$\{now\}`,/g, 'externalId: "biz:demo-1",');

// 2) הערכים שמוחזרים לדיבאג יהיו יציבים ותואמים
s = s.replace(/businessExternalId:\s*`biz:\$\{now\}`,/g, 'businessExternalId: "biz:demo-1",');
s = s.replace(/businessQrData:\s*`businessExternalId:biz:\$\{now\}`,/g, 'businessQrData: "businessExternalId:biz:demo-1",');

fs.writeFileSync(path, s);
console.log("OK: patched convex/seed.ts to stable biz:demo-1");
