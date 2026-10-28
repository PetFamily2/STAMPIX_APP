// A rollout attestation, never an authorization or a substitute for device evidence.
// Unset or misspelled gates keep Production disabled.
exports.productionPilotEnabled = function productionPilotEnabled(
  environment,
  gate
) {
  return environment === 'production' && gate === 'device-verified-pilot-v1';
};

// Public availability is a separate release decision. This is not a test receipt
// or an authorization grant; production configuration is applied after acceptance.
exports.productionPublicEnabled = function productionPublicEnabled(
  environment,
  gate
) {
  return environment === 'production' && gate === 'accepted-web-public-v1';
};

exports.productionWebEnabled = function productionWebEnabled(
  environment,
  gate
) {
  return (
    exports.productionPilotEnabled(environment, gate) ||
    exports.productionPublicEnabled(environment, gate)
  );
};
