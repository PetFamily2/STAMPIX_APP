# Referral configuration — compatibility and rollout gate

Status: **blocked for production approval** until versionless clients are addressed and real two-session acceptance is complete. This document authorizes no deployment.

The current mutation accepts `expectedConfigVersion` optionally. Updated Web and Native clients send it and a stale value is rejected atomically. Previously installed clients omit it. A versionless write can overwrite a newer configuration and still increment the version; newer clients can detect the later increment, but cannot undo that overwrite. There is no server-side way to infer the version that an old client actually saw from a request that never sent it. Refusing such a request immediately would break existing clients. Therefore full backward compatibility and complete prevention cannot both be claimed under the current protocol.

The code now supports the server-side `REFERRAL_REQUIRE_CONFIG_VERSION=true` enforcement switch. It defaults to off when absent, affects only referral configuration saves, and rejects versionless saves with `REFERRAL_CLIENT_UPDATE_REQUIRED`. Current clients show an update-required message and retain their draft on that response; already-installed older clients may only display their generic error. Do not turn the switch on until old-client recovery and communications have been verified and explicitly approved. Read access and unrelated actions remain unchanged. No environment setting has been changed.

## Staged plan for separate approval and implementation

1. Inventory active client versions and identify all paths and device populations that can invoke this mutation. Decide and communicate the minimum supported version and a transition date, including service/support for old devices. Do not collect form contents or identity data merely for this inventory.
2. Prepare updated clients for every supported surface, with version checking, clear conflicts, safe draft retention and update guidance. Verify Web/PWA and Native clients against the exact backward-compatible backend in an authorized isolated environment. Backend availability must precede any client that sends the optional argument.
3. Deploy the compatible backend only with explicit approval, then publish the updated clients through their normal release channels. Validate two separate sessions, in-flight saves and stale responses without real charges. Keep the backend compatible while supported legacy clients remain.
4. Before enforcement, obtain an explicit decision to require an update for any client still lacking the version. Implement a clearly communicated, recoverable update-required response and test its behavior on those clients. Only then make versionless writes fail closed. Backend and client rollouts, data migration if any, rollback and monitoring require their own reviewed plan and authorization.

No synthetic records are permitted in a shared or real business database. No claim of safe concurrent editing across all old clients or deployment readiness is made here.
