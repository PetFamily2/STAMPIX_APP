Current status: RESOLVED by [13 November integration review](CURSOR_UI_INTEGRATION_20261113.md). The original snapshot and pending findings below are retained as history.

# Cursor pending UI snapshot — 12 November 2026

Read-only original worktree inspection confirmed `qa/cloudflare-scanner-onboarding-20261110` at `2579919eca6073de6825aebbdeabbd89594a73b2` with 35 modified tracked code/test files and one new BusinessWebReferrals component. Their exact contents were captured to ignored `.tmp/cursor-uncommitted-ui-20261112.json` and rehashed against the source without changing it. These UNCOMMITTED changes are NOT included by merging the committed scanner QA tip. Review/integration is still required before claiming latest Cursor business-UI parity. The remaining untracked Cursor settings, preview archive/folder and debug log were excluded deliberately. No game or private art files were copied.

The game worktree remains `agent/game-album-001` at `ffaaca2f5c5fe3067df3af8b884e53cd3bea48da` with unpublished album/customer navigation/membership/character work. It was inspected read-only, not switched, reset or integrated. GAME-01/02 remain Post-launch.

All launch follow-up must use the canonical integration branch/worktree in [release source](../RELEASE_SOURCE.md). Do not overwrite either original dirty worktree. Web-only adaptation and conflict review are needed for the pending shared/native UI files; no Android/iOS changes are authorized by this snapshot. No Preview should be called current until this pending review is resolved.

| File | Snapshot SHA-256 |
|---|---|
| `app/(authenticated)/(business)/cards/[programId].tsx` | `734c6bcd87d0db1d08eb00933d073f40039978c93e1d3bde1d1f541700b4ec42` |
| `app/(authenticated)/(business)/dashboard.tsx` | `8c88f0b864ab4d69421038244c51930d63a9d5e3f9ea957f6b0a63bf41750dae` |
| `app/(authenticated)/(business)/settings-business-invite-businesses.tsx` | `294d9e84b0592db1851a2bdf5c8e56f72be6fc5fe34d5d698aa2a983955e0b49` |
| `app/(authenticated)/(business)/settings-business-referrals.tsx` | `0f9704da6a0f81815ef6845d26b8f647b48231a596fe856c71f25f7fada5240d` |
| `app/(web-business)/business/campaign/[campaignId].web.tsx` | `a97027ea9aea563a41009269933d90276a587a9fa0064a51c1197b4fd2207699` |
| `app/(web-business)/business/campaigns.tsx` | `7b9e8b6b5e5ee8363da26a7c86dac05a194e785665791946ab9738e70c60f581` |
| `app/(web-business)/business/cards/[programId].tsx` | `15519f996f88415ac0f8560af0ab279fbe04cb3ea8a86a898da3ed759d34a2aa` |
| `app/(web-business)/business/referrals.tsx` | `637ac2d6e0277c34e68df0528020a1f4a1cbf6a6bf53f6e8212fddc50fcbb129` |
| `components/business-web/BusinessWebBilling.tsx` | `6e06e8806741a6bbb593f7ee34d878228e6e6d1709987709442aabc7fa3d10cd` |
| `components/business-web/BusinessWebBottomNav.tsx` | `aed72b3030d666bf5055533932e8d41d4df75a5ea65fc67e273810952ed8e3bf` |
| `components/business-web/BusinessWebDashboard.tsx` | `a22aa925aa39c9a93949eafb0265e62585f58121943a10ab21704ffed49f6395` |
| `components/business-web/BusinessWebLoyalty.tsx` | `594d9e365ead6b4747fe047d932df44ca087d66ca4b156bc737fe503d50c8092` |
| `components/business-web/BusinessWebShell.tsx` | `d907d1e1e0f41310200b79484e7d677c501454654e7c06091a7928f43b682cd6` |
| `components/business-web/CampaignDraftWizard.web.tsx` | `532e8396c44a5948d7ba78de6fe3bb1cb8893fcdcd25a9cfbb6d07d08400ba9a` |
| `components/business-web/LoyaltyManagementEntry.tsx` | `ce7b4917ba2e846079970cd5f43625bb3fa52053ae233640f848796ab2040fae` |
| `components/business-web/WebManagementSurface.tsx` | `489ccb8b576acc82b17cf6d84398070db295f186ab2453a75f14eab538e2728f` |
| `components/loyalty/ClassicStampGlyph.tsx` | `629e94fc49dcf4bfcee0f29da1b02d74c92571883bed855714a7e5ff9213b557` |
| `components/loyalty/LoyaltyThemePalette.tsx` | `0ae737565227e8e2d5ead5fcf270a2220e1db33baae73f197ea90912b47c5bba` |
| `components/loyalty/StampIconPicker.tsx` | `d690a33d3e26c9fdc24196ee0c2eec47284dc730ec606dada18a588f51e1f2a2` |
| `components/loyalty/StampShapePicker.tsx` | `4ba663cd77cca9e84174730324c557193ac8ab413059069d163286978e1aeae2` |
| `components/loyalty/VisualSelectionTile.tsx` | `82e2cf0c90cd114c06bad946393bee4e0920376d6544d182286e4d2c3c66257f` |
| `components/management/EditorPrimitives.tsx` | `d093ad2e38dad2e67591cae24077a8a02745b56e4e775dfc26ddb025bb59a3bc` |
| `components/management/ManagementPageHeader.tsx` | `52fce44e935132f8f4077442837b517183bbf148bd5fc769f592f546b1ce49c5` |
| `components/pwa-ui/PwaButton.tsx` | `7ea63608c7bf396914814eb2861d0805ed311ad0c56e7e4b1ad663f1e3b19f50` |
| `components/referrals/ReferralEmptyState.tsx` | `5f87ac654fb51fd742e84ae6e99bc40659a44cdaaa61a4af4154dad735df1fae` |
| `lib/__tests__/businessRemediationPass.test.js` | `5c1e17f3eadc3e5f76b9ace1ac987aa3799ffb8f527904cfd93918c750522113` |
| `lib/__tests__/businessWebPhase3b.test.js` | `42049f8d1fa4f959967067ee9abf044ec1e068a474bc46cbfc2b9e8841fcfeeb` |
| `lib/__tests__/campaignWizard.test.js` | `8a1f7c856087d279a2367b84e2a202a765e9e5ae7fce52090f9ca7876a849cac` |
| `lib/__tests__/loyaltyDesignSystem.test.js` | `d0b864b59a9ee70909ebcc49f58754cc599a9a512dc5b52090a68010c81262d8` |
| `lib/__tests__/loyaltyUxCompletion.test.js` | `b14e359ddfa9e5e7f35cc5b70f94001efd03412396cb783ffd0a26896dbc5536` |
| `lib/__tests__/responsiveNavigation.test.js` | `a43a291f1c2278da900a50c1137dd768ab8d382c52b96df26067e8127c6a8af7` |
| `lib/__tests__/webPlatformAdapters.test.js` | `00f02f2f87929d3a6bf46bd1b13497bb1ef51fa57a51ad476b3caf8b11923f0d` |
| `lib/businessWebNavigation.ts` | `ff80769cf5f3b6d561c8bd39760d1f53116d7f460de7c3781d23f620297728ef` |
| `lib/campaigns/campaignWizard.ts` | `581cbf133121239f08411c79bd071dd8aa9c796cffe3189edf39c7a8b89fa100` |
| `lib/navigation/businessHref.ts` | `6b685532203e232bd13202e8af0202bc165aa4bdd6b2d15728a6bd21c04e1bbe` |
| `components/business-web/BusinessWebReferrals.tsx` | `7d9eb78d94da7ae849a168d3fa4f142ade5260e109c6fcb8e39f3588612689e1` |
