# Phase 1: Web role routing in Preview

Base: `launch/trial-and-launch-hardening` at
`3d8d01ad6a506e4ca4f49ba1dc470203aa49c270`.
Branch: `pwa/phase-1-role-routing-20261004`.

## Rollout

Both build-time values are required:

```env
EXPO_PUBLIC_APP_ENV=preview
EXPO_PUBLIC_WEB_ROLE_ROUTING=true
```

Missing/false values, development, Production and Native all leave the new
rollout disabled. URL parameters do not enable the rollout or authenticate a
user. Convex is still the authority for session, role and onboarding state.

| Server-derived destination | Web flag off | Web Preview flag on | Native |
| --- | --- | --- | --- |
| Customer | `/business` | Customer Wallet and existing customer routes | Unchanged |
| Owner/manager business mode | `/business` | `/business` | Unchanged |
| Staff business mode | `/business` | `/staff`, protected landing only | Existing scanner |
| Customer onboarding incomplete | `/business` | Existing name/onboarding flow | Unchanged |
| Business onboarding incomplete/in progress | `/business` | Existing merchant onboarding flow | Unchanged |
| Loading/session unresolved | Existing loading | Loading, no privileged shell | Unchanged |
| Signed out | Existing auth | Auth, including direct/preview-query URLs | Unchanged |

Owner/manager in customer mode uses the customer destination. Active membership
and onboarding come from existing server queries; role is never inferred from
the URL. The Web authenticated layout redirects Native management groups before
they mount. The new staff landing imports no camera or scanner mutation.

## Delivery

One GitHub PR workflow targets main or the launch branch. It has one verify job,
PR concurrency with cancel-in-progress, and no duplicate push trigger. Only
same-repository Phase 1 PWA PRs deploy a Web Preview, after verify succeeds.
The old duplicate trial verification, independent Preview deployment and EAS PR
auto-deployment workflows are removed in this branch.

Verification runs the full suite/typecheck, RTL source/native config introspection,
unchanged Native/backend boundary checks, Native billing-disabled guard and
Web/iOS/Android JavaScript exports. JavaScript export/config inspection does not
mean a native binary was compiled or tested on a physical device.

Preview hosting reads the existing EAS Preview environment and retains public
client variables only. It rejects identical configured DEV/Production URLs.
It does not need or load a Convex deploy key, invoke Convex sync, change schema,
rotate credentials, enable SUMIT Production or promote a Production deployment.

The credential-pattern artifact check is deliberately bounded; it does not
replace a full history/environment/security audit.

## Rollback and remaining gates

Build the next Preview with `EXPO_PUBLIC_WEB_ROLE_ROUTING=false` to restore the
legacy Web landing. There is no backend migration/data rollback. Native is not
dependent on the Web rollout.

No camera Web implementation, scanner command change, manifest, service worker,
Web Push or Maps provider is included. Customer route access is not full browser
parity: existing Alert/storage/share/location gaps and camera/offline contracts
remain for later approved phases. Live provider E2E and physical Native QA are
separate release gates. Stop after the Phase 1 report; Phase 2 needs approval.
