# Dependency patches

## expo-sharing 14.0.8

Expo SDK 54 uses the `expo-sharing` 14.x line. Version 14.0.8 can leave
`shareAsync` pending on iOS when a user selects an activity and then cancels
its follow-up flow.

`expo-sharing@14.0.8.patch` backports the upstream completion-handler fix from
expo/expo#45456: every `UIActivityViewController` dismissal resolves the
promise. This lets the redemption sharing flow leave its busy state and
release its temporary capture after successful sharing or cancellation.

Remove this patch when the project upgrades to an Expo-compatible
`expo-sharing` version that already contains the upstream fix.
