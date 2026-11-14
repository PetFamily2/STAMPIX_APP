# Stage 2 — initial stability work

Base: stage 1 `c52ef9f158262fa0aa91fff639f8299f069d04be` (PR #17). This is not stage 2 acceptance.

| Area | Initial finding | Change and validation | Remaining |
| --- | --- | --- | --- |
| Referral editor | Web settings subscribed to config, performance, customers and rewards regardless of tab. | The three reporting queries now subscribe only on their matching Web tab. Config remains available; Native subscription behavior is unchanged. Static subscription count on settings: four referral queries to one, excluding entitlement query. | Measure real-device input/render latency; protect local draft from reactive updates and navigation; review pagination and server query costs. |
| PWA updates | Existing Business Web dirty-form guard did not participate in update safety, and controller change did not check Convex in-flight requests. | Existing dirty guard registers local unsaved state; update safety and controller reload now consult it. In-flight Convex requests also block controller reload. Local registration and existing worker safety tests pass. | Other forms not using the existing guard are not yet protected. Verify multi-tab, scanner, payment and installed-device scenarios. |
| Other areas | Not yet reviewed comprehensively. | No backend/schema changes. | Review queries, screens, performance metrics and regression gates described in stage 2. |

No production deployment, real charge or database mutation was performed. Device acceptance and isolated load measurements are not yet completed.
