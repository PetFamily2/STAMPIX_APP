# jsQR 1.4.0 — unmodified upstream distribution

Phase 3 removed the Phase 2 version-23 alignment patch. No reproducible
standard fixture was found where upstream fails and that patch succeeds.
The clean version-23 fixture and all forty standard-version fixtures decode
with upstream too. A table-coordinate assertion was not evidence of a
decoder failure.

The distribution now exactly matches the upstream npm SHA-256 recorded in
`docs/qr-decoder-provenance.json`. No local decoder fork remains.
The Apache-2.0 license is retained.
