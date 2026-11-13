# Phase 2 — isolated Web QR foundation

Base: `fca2febbcec1598491854c8ab751561684308d7a` (Phase 1 final).
Branch: `pwa/phase-2-qr-foundation-20261005`.
PR target: `pwa/phase-1-role-routing-20261004`. No merge to main.

## Implementation decision

Use a separate `components/web-scanner/QrScanner.web.tsx` adapter,
MediaDevices camera controller and locally hosted jsQR 1.4.0 in a dedicated
classic Worker. The existing `components/QrScanner.tsx` is byte-for-byte
unchanged. The new adapter is not selected by platform extension resolution
for any existing business scanner. It is imported only by the standalone lab.

The Preview-only page is generated after Expo export, at
`/scanner-lab/index.html`. It has its own React root and imports no Expo routing,
Convex/auth providers, business APIs, analytics or storage. Its CSP denies
connections (`connect-src 'none'`) and permits scripts/workers from the same
origin only. QR pixels remain inside local computation. The worker returns
only length metadata: no raw QR crosses into UI callbacks. No stamp, redeem,
resolve, undo or referral action can be invoked by this page.

Both build-time values are required to generate the lab:

```env
EXPO_PUBLIC_APP_ENV=preview
EXPO_PUBLIC_WEB_QR_LAB=true
```

The exporter omits the lab outside exact Preview and deletes a previously
generated lab in a reused output directory. This is an isolated deployment
artifact, not a Production Expo route. The flag is not authorization.

## Research, checked 2026-10-05

The locked `expo-camera@17.0.10` source in
`src/web/useWebQRScanner.ts` creates a blob worker and imports
`https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js` at runtime.
It is therefore not reused for this Web lab.

| Option | Latest npm version/date inspected | Distribution size / gzip bytes | Decision |
| --- | --- | --- | --- |
| Local jsQR decoder + owned camera lifecycle | 1.4.0 / 2021-04-24 | 256,885 / 56,829 before local patch | Selected: QR-only core, local Worker, no package/lockfile change; pinned hash and license |
| nimiq qr-scanner | 1.4.2 / 2022-11-23 | main 15,844 / 5,654; worker 43,994 / 10,203 | Viable lighter alternative; not selected because camera lifecycle is coupled to wrapper, dynamic worker integration and maintenance uncertainty |
| html5-qrcode | 2.3.8 / 2023-04-15 | 375,364 / 107,814 | Unneeded multi-format/UI wrapper; older release and camera/restart reports |
| @zxing/library | 0.23.0 / 2026-04-29 | full UMD 362,150 / 107,243 | QR core could be bundled separately, but full wrapper unnecessary; project explicitly maintenance-only and browser-layer leak/restart issues remain |
| BarcodeDetector alone | Browser API | no library payload | Cannot provide consistent Safari support; API is not Baseline, no fallback-free choice |

Sizes are measured on the named npm distributions with Python gzip, not an
apples-to-apples tree-shaken production app comparison. No claim that the
selected decoder is the smallest or actively maintained. Registry publication
and GitHub push dates do not establish continuing maintainer support.

Important primary evidence reviewed:

- jsQR Android lag: https://github.com/cozmo/jsQR/issues/190
- jsQR iOS stream freeze: https://github.com/cozmo/jsQR/issues/185
- jsQR version 23 alignment bug: https://github.com/cozmo/jsQR/issues/251
- nimiq pending permission resource leak: https://github.com/nimiq/qr-scanner/issues/90
- nimiq camera selection: https://github.com/nimiq/qr-scanner/issues/260
- nimiq maintenance question: https://github.com/nimiq/qr-scanner/issues/266
- Samsung opening failure: https://github.com/mebjas/html5-qrcode/issues/984
- Samsung restart/resource race: https://github.com/mebjas/html5-qrcode/issues/483
- Lens/focus selection: https://github.com/mebjas/html5-qrcode/discussions/655
- ZXing continuous decode memory report: https://github.com/zxing-js/library/issues/391
- ZXing browser worker rationale: https://github.com/zxing-js/library/issues/42
- ZXing Safari PWA restart report: https://github.com/zxing-js/browser/issues/122
- ZXing maintenance statement: https://github.com/zxing-js/library/blob/master/README.md
- Inline playback: https://webkit.org/blog/6784/new-video-policies-for-ios/
- iOS standalone PWA camera issue: https://bugs.webkit.org/show_bug.cgi?id=252465
- Permissions, secure context, release before camera switch:
  https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
- BarcodeDetector compatibility: https://developer.mozilla.org/en-US/docs/Web/API/Barcode_Detection_API

These are bug reports and documentation, not proof of current failure on all
devices. WebKit #252465 is marked FIXED yet includes later reports into 2025;
Safari browser and installed home-screen mode require separate device checks.
Browser-level limitations are not solved by swapping QR decoder libraries.

## Decoder provenance and local fix

Vendor source and Apache-2.0 license are retained. The npm tarball shasum was
verified on acquisition; both upstream and modified distribution SHA-256
values are in `qr-decoder-provenance.json`. Export checks the modified hash.
Only one upstream table entry is corrected: version-23 alignment center
74 becomes 78. See `vendor/jsqr/CHANGES.md`.

Tests confirm the coordinate against the independent qrcode encoder and exercise
the modified decoder against generated standard QR versions 1–40. The clean
version-23 fixture also decoded with the original coordinate, so the issue's
claim of universal failure was not reproduced and is not asserted here.
This is a maintained local patch, not an upstream release. Future vendor
updates require reviewing/removing the patch and running those fixtures.

## Camera/lifecycle contract

- User gesture starts permission request; HTTPS and secure context required.
- Rear camera preferred with ideal facingMode; exact device ID only on explicit
  selection. Enumerate cameras after permission, without opening an extra stream.
- Optional continuous focus request only when the track advertises support;
  rejection is ignored. Labels/focus capability may be unavailable in Safari.
- `playsInline`, muted, no audio capture; video stays mounted and visible.
- Permission denied, unavailable hardware, unsupported API, insecure page,
  start/decode failures and stalled video have separate safe UI states.
- Start timeout 20s; late permission streams are stopped after cancellation.
  Pending camera requests are not duplicated. Pending `video.play()` can be
  cancelled on background/unmount rather than preventing recovery forever.
- `visibilitychange`/`pagehide` release tracks, Worker, timers and video srcObject.
  `pageshow`/foreground resumes only a previously granted, wanted, unlocked scan.
- Ended/muted tracks pause capture; explicit restart is available. Browser
  camera release/reacquisition timing and autofocus still need DEVICE VERIFY.
- One decode in flight; at most four decode attempts/sec, adaptive delays up
  to 1s on slow decodes; no work on unchanged video frames.
- Full image is scaled to a longest edge of 640 pixels; transfer buffers move
  to the Worker instead of queueing multiple frames. 4s decode watchdog.
- Successful decode locks immediately and releases camera/Worker. Explicit
  reset clears metadata and lock. No QR contents are retained for deduplication.
- An idle scan is paused after two minutes to bound unattended camera/decoder
  lifetime. This is a lab behavior, not approved production POS policy.

## CI and Native boundaries

One PR workflow, no push duplication, PR concurrency/cancel-in-progress and
Preview dependent on verify are retained. Phase 2 PRs can target the Phase 1
branch; the Phase 2 boundary script verifies the approved base is an ancestor
and permits only lab/decoder/docs/tests and the existing workflow/lint config.

No Convex sync, backend change, package/lockfile change, Native scanner/business
flow, billing, RTL or Native configuration change. Native exports must still
pass, but exports are not compiled Native binaries or physical device QA.
The vendor directory is excluded from Biome so upstream third-party formatting
is not rewritten. The existing repository-wide Biome debt is not repaired here.

## Lab test flows

- Real permission path: `/scanner-lab/index.html`.
- Denied UX simulation: `/scanner-lab/index.html?scenario=denied`.
- No camera UX simulation: `/scanner-lab/index.html?scenario=no-camera`.
- Actual Worker decode of a synthetic image:
  `/scanner-lab/index.html?scenario=decode-fixture`.

Simulation is visibly labelled. It does not claim actual OS permission denial.
The decoder fixture exercises local worker loading/pixel decode but is not a
physical camera scan. Browser checks must clearly distinguish these cases.

## Browser matrix / DEVICE VERIFY

| Browser/mode | Engineering provisions | Release evidence still required |
| --- | --- | --- |
| Safari iPhone | inline muted stream, local classic worker, cancel/restart and page lifecycle | Actual device permission, rear lens/focus, background/control center, scan latency, repeated restart |
| iPhone home-screen standalone mode | same controller, explicit resource cleanup | Separate from Safari; long suspend/relaunch and black-stream regression checks; no PWA installation support is added in Phase 2 |
| Chrome Android | rear preference, ID switching, optional focus, adaptive worker scan | Real camera, low-end performance/battery, switching and repeated restart |
| Samsung Internet | standards-based capture and local classic worker | Actual browser/version, lens choice, focus, stream restart; not inferred from Chrome results |
| Desktop Chromium | lab UI and error/decode fixture paths | Physical webcam scan if no hardware was exposed to automation |

Do not claim physical scanning, focus, battery, soak/leak tests or mobile
compatibility passed without device evidence.

## Recommendation for Phase 3

Proceed, after explicit approval, with Preview-only design/implementation of
online-only command transport and resolve/commit/reconciliation safety.
Keep business Web scanning disabled for users until DEVICE VERIFY passes on
Safari iPhone, Chrome Android and Samsung Internet. Native remains a supported
fallback. Phase 2 does not prove Native is technically required for ordinary
QR decode, nor that Web matches Native reliability on every device.
Do not start Phase 3 from this document automatically.
