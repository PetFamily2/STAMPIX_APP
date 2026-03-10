# Business Dashboard V2 - Developer Handoff (No-Code Spec)

Last synced: 2026-03-10
Owner: Product + Mobile
Target surface: `app/(authenticated)/(business)/dashboard.tsx`
Status: Ready for implementation planning

## 1) Scope

This spec defines the upgraded business dashboard as an executive overview screen.

In scope:
- Dashboard information architecture and section order.
- Component-level contracts (data source, fields, states, routing, entitlements).
- Priority rules for `Hero` status line and `Requires Attention`.
- New-business behavior and data-rich behavior.
- MVP vs Phase 2 split.
- Implementation risks and mitigations.

Out of scope (for MVP):
- Rebuilding backend business logic.
- New campaign management screen.
- Deep filtered customer route params.
- Design system refactor outside dashboard.

Hard constraints:
- Reuse current backend functions and current role/plan enforcement.
- Do not break existing entitlement/permission logic.
- Keep dashboard compact and scannable in < 5 seconds.

## 2) Source Of Truth (Existing Implementation)

Primary screen and navigation:
- `app/(authenticated)/(business)/dashboard.tsx`
- `app/(authenticated)/(business)/_layout.tsx`

Depth screens used by dashboard routing:
- `app/(authenticated)/(business)/scanner.tsx`
- `app/(authenticated)/(business)/analytics.tsx`
- `app/(authenticated)/(business)/customers.tsx`
- `app/(authenticated)/(business)/cards/index.tsx`
- `app/(authenticated)/(business)/settings-business-profile.tsx`
- `app/(authenticated)/(business)/settings-business-subscription.tsx`

Shared business identity:
- `contexts/ActiveBusinessContext.tsx`
- `hooks/useActiveBusiness.ts`

Entitlements and limits:
- `hooks/useEntitlements.ts`
- `convex/entitlements.ts` (`getBusinessEntitlements`, `getBusinessUsageSummary`)

Data providers:
- `convex/business.ts` (`getBusinessSettings`)
- `convex/analytics.ts` (`getBusinessActivity`)
- `convex/events.ts` (`getCustomerManagementSnapshot`, `getRecentActivity`)
- `convex/loyaltyPrograms.ts` (`listManagementByBusiness`)
- `convex/customerLifecycle.ts`

## 3) Final Screen Order (Top -> Bottom)

1. `DashboardHero`
2. `DashboardPrimaryKpiRail`
3. `DashboardRequiresAttention`
4. `DashboardCustomerHealthSnapshot`
5. `DashboardLoyaltyProgramsSnapshot`
6. `DashboardRecentActivityPreview`

Removed from dashboard surface in MVP:
- Full Team management block.
- Full plan/subscription management block.
- In-dashboard retention action cards with send/AI buttons.
- Old 2x2 quick-action grid.

## 4) Global Data Contract (Dashboard Container)

Container queries:
- `useActiveBusiness()` for business identity and switching.
- `useEntitlements(activeBusinessId)` for plan, gates, limit status.
- `api.business.getBusinessSettings({ businessId })`
- `api.entitlements.getBusinessUsageSummary({ businessId })`
- `api.analytics.getBusinessActivity({ businessId })`
- `api.events.getCustomerManagementSnapshot({ businessId })` only if smart analytics gate open.
- `api.loyaltyPrograms.listManagementByBusiness({ businessId })`
- `api.events.getRecentActivity({ businessId, limit: 3 })`

Container guards:
- Keep existing app mode redirect behavior (`business` mode only).
- Keep existing role access behavior enforced by business tab layout.

Global loading strategy:
- First paint: show section skeletons, not spinner-only screen.
- Partial data: each section renders independently with graceful fallback.
- Never block Hero and scanner CTA because a lower section failed.

Global error strategy:
- Section-level error states only.
- Do not throw full-screen hard errors for non-critical query failures.

## 5) Section Specs

### 5.1 `DashboardHero`

Component goal:
- Immediate sense of control, identity, and action.

Data source in current code:
- Business identity from `useActiveBusiness()`.
- Plan from `useEntitlements().entitlements.plan`.
- Business profile completion from `api.business.getBusinessSettings`.
- Usage summary from `api.entitlements.getBusinessUsageSummary`.
- Activity signal from `api.analytics.getBusinessActivity`.
- Programs signal from `api.loyaltyPrograms.listManagementByBusiness`.
- Customer risk signal from `api.events.getCustomerManagementSnapshot` when available.

Required fields:
- `activeBusiness.name`
- `activeBusiness.logoUrl` (optional)
- `activeBusiness.colors` (optional)
- `entitlements.plan`
- `businessSettings.profileCompletion.isComplete`
- `businessSettings.profileCompletion.missingFields.length`
- `usageSummary.cardsUsed`, `usageSummary.customersUsed`, `usageSummary.activeRetentionActionsUsed`
- `activity.daily[]`
- `programs.length`
- `customerSnapshot.summary.atRiskCustomers` (if unlocked)

Display conditions:
- Show Hero whenever `activeBusinessId` exists.
- Render plan chip only when `entitlements` loaded.
- Render business switch affordance always.

States:
- Loading: skeleton for business name, status line, and CTA row.
- Empty: not expected if business tab is reachable.
- Error: show fallback title with scanner CTA and hide dynamic status text.

Press actions and routing:
- Business switch control: reuse business picker modal behavior from settings screen.
- Plan chip press -> `/(authenticated)/(business)/settings-business-subscription`.
- Primary CTA press -> `/(authenticated)/(business)/scanner`.
- Optional secondary press on status line -> route based on active status reason.

Permission / entitlements dependencies:
- No direct lock on Hero.
- Status line logic can reference entitlement/role data.

Delivery phase:
- MVP required.

### 5.2 `DashboardPrimaryKpiRail`

Component goal:
- Show 4 reliable macro KPIs in one row.

Data source in current code:
- `api.analytics.getBusinessActivity` (`daily` only for 7-day KPIs).
- `api.entitlements.getBusinessUsageSummary`.

Required KPI fields:
- KPI 1 `Stamps (7d)`: `sum(activity.daily[].stamps)`
- KPI 2 `Redemptions (7d)`: `sum(activity.daily[].redemptions)`
- KPI 3 `Active loyalty customers`: `usageSummary.customersUsed`
- KPI 4 `Active loyalty cards`: `usageSummary.cardsUsed`

Display conditions:
- Always show rail.
- Use numeric zero states when no activity.

States:
- Loading: 4 KPI skeleton cells.
- Empty: show `0` values.
- Error: show `--` for failed metrics and keep cells clickable where possible.

Press actions and routing:
- KPI 1 press -> `/(authenticated)/(business)/analytics`
- KPI 2 press -> `/(authenticated)/(business)/analytics`
- KPI 3 press -> `/(authenticated)/(business)/customers`
- KPI 4 press -> `/(authenticated)/(business)/cards`

Permission / entitlements dependencies:
- No gating.

Delivery phase:
- MVP required.

Notes:
- Do not label values as "weekly" if not computed from `daily` 7-day window.
- Avoid using `activity.totals.*` as weekly values.

### 5.3 `DashboardRequiresAttention`

Component goal:
- Surface up to 3 highest-priority actionable risks.

Data source in current code:
- Profile completion: `api.business.getBusinessSettings`.
- Limits: `useEntitlements().limitStatus` + usage summary.
- Program count: `api.loyaltyPrograms.listManagementByBusiness`.
- Activity signal: `api.analytics.getBusinessActivity`.
- Customer lifecycle risk: `api.events.getCustomerManagementSnapshot` (if unlocked).

Required fields:
- `missingFields.length`
- Limit status for `maxCards`, `maxCustomers`, `maxActiveRetentionActions`
- `programs.length`
- `sum(activity.daily[].stamps)`
- `customerSnapshot.summary.atRiskCustomers`
- `customerSnapshot.summary.nearRewardCustomers`

Display conditions:
- Section appears only when at least one alert exists.
- Max cards shown: 3.

States:
- Loading: up to 3 skeleton rows.
- Empty: section hidden.
- Error: only skip items from failed source; keep other items.

Press actions and routing:
- `Complete business profile` -> `/(authenticated)/(business)/settings-business-profile`
- `Plan limit reached / near limit` -> `/(authenticated)/(business)/settings-business-subscription`
- `No active card yet` -> `/(authenticated)/(business)/cards`
- `At-risk customers found` -> `/(authenticated)/(business)/customers`
- `Near-reward customers found` -> `/(authenticated)/(business)/customers`
- `No activity in 7 days` -> `/(authenticated)/(business)/analytics`

Permission / entitlements dependencies:
- Lifecycle-based alerts require `smartAnalytics` gate to be open.
- Profile completion action button visible only for owner/manager role.

Delivery phase:
- MVP required.

### 5.4 `DashboardCustomerHealthSnapshot`

Component goal:
- Quick lifecycle health overview without entering full customers screen.

Data source in current code:
- `api.events.getCustomerManagementSnapshot` (smart analytics-gated).

Required fields:
- `summary.activeCustomers`
- `summary.atRiskCustomers`
- `summary.nearRewardCustomers`
- `summary.vipCustomers`
- `summary.newCustomers`
- `insights[0]` (optional line)

Display conditions:
- If gate open: render 4 tiles + insight line.
- If gate locked: render compact teaser card with upgrade route (not blocking overlay).

States:
- Loading: 2x2 tile skeleton + insight placeholder.
- Empty: if `summary.totalCustomers === 0`, show onboarding empty copy.
- Error: inline compact error card and keep section footprint.

Press actions and routing:
- Section title press -> `/(authenticated)/(business)/customers`
- Any tile press -> `/(authenticated)/(business)/customers`
- Insight press (optional) -> `/(authenticated)/(business)/customers`

Permission / entitlements dependencies:
- Gate: `smartAnalytics` from `useEntitlements().gate('smartAnalytics')`.

Delivery phase:
- MVP required.

### 5.5 `DashboardLoyaltyProgramsSnapshot`

Component goal:
- Summarize card-program performance and health.

Data source in current code:
- `api.loyaltyPrograms.listManagementByBusiness`.

Required fields:
- Per program: `loyaltyProgramId`, `title`, `lifecycle`, `metrics.activeMembers`, `metrics.stamps7d`, `metrics.redemptions30d`, `metrics.lastActivityAt`.
- Derived summary:
- `activeProgramsCount`
- `sumActiveMembers`
- `sumRedemptions30d`

Display conditions:
- If active programs > 0: show summary + top 2 program rows.
- If none: show empty card with create/manage CTA.

States:
- Loading: summary skeleton + 2 row skeleton.
- Empty: explicit zero state and CTA.
- Error: compact retry/fallback card.

Press actions and routing:
- Section header press -> `/(authenticated)/(business)/cards`
- Program row press -> `/(authenticated)/(business)/cards/[programId]`
- Empty-state CTA -> `/(authenticated)/(business)/cards`

Permission / entitlements dependencies:
- No direct gate.

Delivery phase:
- MVP required.

### 5.6 `DashboardRecentActivityPreview`

Component goal:
- Reinforce live system feel with minimal feed preview.

Data source in current code:
- `api.events.getRecentActivity({ businessId, limit: 3 })`

Required fields:
- `id`, `type`, `customer`, `detail`, `time`

Display conditions:
- Always show section.
- Max items shown: 3.

States:
- Loading: 3 row skeleton.
- Empty: explicit empty activity message.
- Error: compact inline error text.

Press actions and routing:
- Header action `View all activity` -> `/(authenticated)/(business)/analytics`
- Row press in MVP: no action.

Permission / entitlements dependencies:
- No gate.

Delivery phase:
- MVP required.

## 6) Hero Status Line Priority Rules

Render one status line only, by first matched rule:

1. Profile incomplete:
- Condition: `profileCompletion.isComplete === false`
- Action route: profile settings

2. No loyalty program:
- Condition: `activeProgramsCount === 0`
- Action route: cards screen

3. Any hard limit reached:
- Condition: any of `maxCards`, `maxCustomers`, `maxActiveRetentionActions` is at limit
- Action route: subscription settings

4. Any limit near threshold:
- Condition: any tracked limit is near threshold
- Action route: subscription settings

5. No stamps in last 7 days:
- Condition: `sum(activity.daily[].stamps) === 0`
- Action route: analytics

6. At-risk customers exist (if smart analytics unlocked):
- Condition: `summary.atRiskCustomers > 0`
- Action route: customers

7. Default healthy status:
- Condition: no rule above matched
- Message: positive weekly summary
- Action route: none required

## 7) Requires Attention Priority Rules

Candidate alerts:
- `Profile incomplete`
- `No active loyalty cards`
- `Limit reached`
- `Limit near`
- `At-risk customers > 0`
- `Near-reward customers > 0`
- `No stamps in last 7 days`

Selection policy:
- Sort by fixed priority above.
- Keep first 3 only.
- Hide section if list is empty.

## 8) Data State Behavior

### 8.1 New business with no data

Expected signals:
- No active programs.
- No activity events.
- Zero customers.
- Possible incomplete profile.

Dashboard behavior:
- Hero with setup-first status.
- KPI row all zeros.
- Requires Attention shows setup alerts.
- Customer Health shows onboarding empty state.
- Programs Snapshot shows empty + CTA.
- Recent Activity shows empty state.

### 8.2 Data-rich active business

Expected signals:
- Multiple programs.
- Event activity in daily window.
- Lifecycle snapshot populated.

Dashboard behavior:
- Hero shows single high-priority status or healthy summary.
- KPI row with real values.
- Requires Attention capped at 3.
- Health snapshot with all 4 tiles.
- Program snapshot shows top 2 active programs.
- Recent activity shows 3 latest items.

## 9) Reuse-Only vs New Work Matrix

Reuse-only (MVP feasible with existing backend):
- Hero identity and plan chip.
- KPI row using `daily` sums + usage summary.
- Requires Attention from existing queries.
- Customer Health snapshot tiles.
- Programs snapshot (summary + top 2).
- Recent activity list with limit 3.

Requires new frontend selectors (no backend change):
- `buildHeroStatusLine()`
- `buildAttentionItems()`
- `buildPrimaryKpis()`
- `buildProgramSnapshotSummary()`

Requires backend expansion or query contract change (not MVP required):
- Reliable `unique customers (7d)` KPI if this KPI is required as top-4.
- Rich recent-activity date context (requires `createdAt` in response).
- Deep-link filters into customers screen (route params for status filtering).
- Dedicated marketing hub summary endpoint for dashboard card parity.

## 10) Permissions / Entitlements Map

Business access:
- Keep current route access via business tabs layout.

Role dependencies:
- Dashboard actions that mutate data should remain owner/manager only.
- Profile completion CTA visible but actionable for owner/manager.

Entitlement dependencies:
- `smartAnalytics` controls lifecycle-based health numbers and related alerts.
- Limit states depend on `useEntitlements().limitStatus`.

Implementation caution:
- `useEntitlements` returns permissive defaults before load.
- Gate-based UI must wait for entitlements loading to prevent flicker/unlocked flash.

## 11) MVP Delivery Order (Execution Checklist)

1. Refactor dashboard structure into section components (same file or local components).
2. Implement container-level query orchestration and section fallback strategy.
3. Implement Hero with status-line priority selector.
4. Implement KPI row with explicit 7-day calculations from `daily`.
5. Implement Requires Attention selector and capped rendering.
6. Implement Customer Health snapshot (unlocked and locked teaser states).
7. Implement Programs snapshot and empty-state CTA.
8. Implement Recent activity preview with limit 3.
9. Remove old dashboard blocks not in new IA.
10. Validate routing and role/plan behavior across scenarios.

## 12) Acceptance Criteria

Functional:
- Dashboard shows 6 sections in defined order.
- No section blocks entire page due to partial query failure.
- Hero status line follows exact priority rules.
- Requires Attention shows max 3 cards by priority.
- All routes from section presses navigate to existing depth screens.

Data correctness:
- KPI labels match actual computation windows.
- Zero states are explicit and not treated as load failures.
- Locked lifecycle data does not leak counts on restricted plans.

UX:
- User can understand business state within first viewport.
- Primary CTA (`Scan customer`) is always visible near top.
- Dashboard remains concise; no full management forms embedded.

## 13) Risk Register (Pre-Implementation)

Risk: KPI label/data mismatch repeats from current dashboard.
- Impact: High trust loss.
- Mitigation: enforce calculation source per KPI in selector unit tests.

Risk: Entitlement flicker unlocks locked content briefly.
- Impact: Medium UX inconsistency.
- Mitigation: delay gate-dependent UI until entitlements load complete.

Risk: Customers summary unavailable on locked plans creates layout jumps.
- Impact: Medium visual instability.
- Mitigation: fixed-height locked teaser in place of hidden section.

Risk: Business switch UX duplicated inconsistently from settings.
- Impact: Medium maintenance overhead.
- Mitigation: extract and reuse one business-picker pattern.

Risk: Recent activity lacks date context.
- Impact: Low-to-medium clarity issue.
- Mitigation: MVP keeps current `time` display; Phase 2 adds backend field.

## 14) QA Matrix (Minimum)

Roles:
- Owner
- Manager
- Staff (should not access business dashboard route under current layout policy)

Plans:
- Starter
- Pro
- Premium
- Inactive paid subscription

Data profiles:
- New business (0 programs, 0 events, incomplete profile)
- Active small business (1 program, low activity)
- Active large business (multiple programs, dense activity, lifecycle data)

Validation points:
- Section visibility and fallback behavior.
- Correct press routing per section.
- Correct locked/unlocked states by plan.
- Correct status-line and attention priority outcomes.
