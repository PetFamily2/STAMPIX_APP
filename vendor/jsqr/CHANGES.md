# Local jsQR 1.4.0 patch

The vendored Apache-2.0 distribution is from the npm jsqr 1.4.0 tarball.
Upstream and modified SHA-256 values, npm integrity and source are recorded in
`docs/qr-decoder-provenance.json`. Export checks the modified SHA-256.

Local change: the version-23 alignment centers are corrected from
`[6, 30, 54, 74, 102]` to `[6, 30, 54, 78, 102]`.
Report: https://github.com/cozmo/jsQR/issues/251.
The change is independently exercised by generated QR fixtures for all forty
standard QR versions, using the existing qrcode encoder dependency. This is
not a claimed upstream release, nor a physical camera/optics verification.

No other decoder behavior is changed. The original license is retained.
