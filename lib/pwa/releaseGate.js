// A rollout attestation, never an authorization or a substitute for device evidence.
// Unset or misspelled gates keep Production disabled.
exports.productionPilotEnabled = function productionPilotEnabled(environment, gate) {
  return environment === 'production' && gate === 'device-verified-pilot-v1';
};
