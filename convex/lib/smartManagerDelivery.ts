import { hashSmartManagerValue } from './smartManagerPolicy';

export const SMART_MANAGER_DELIVERY_BATCH_SIZE = 25;
export const SMART_MANAGER_MAX_PUSH_ATTEMPTS = 3;
export const SMART_MANAGER_DELIVERY_LEASE_MS = 2 * 60 * 1000;
export const SMART_MANAGER_DELIVERY_SWEEP_LIMIT = 25;
export const SMART_MANAGER_READY_RECOVERY_LIMIT = 12;
export const SMART_MANAGER_DELIVERING_RECOVERY_LIMIT =
  SMART_MANAGER_DELIVERY_SWEEP_LIMIT - SMART_MANAGER_READY_RECOVERY_LIMIT;
export const SMART_MANAGER_PUSH_BACKOFF_MS = [60_000, 5 * 60_000] as const;

export type SmartManagerDeliveryFailureCode =
  | 'BUSINESS_NOT_FOUND'
  | 'BUSINESS_INACTIVE'
  | 'BUSINESS_DELETION_IN_PROGRESS'
  | 'SUBSCRIPTION_INACTIVE'
  | 'SMART_MANAGER_CAPABILITY_UNAVAILABLE'
  | 'CAMPAIGN_SEND_ENTITLEMENT_UNAVAILABLE'
  | 'IMMUTABLE_BINDING_INVALID'
  | 'RECIPIENT_SET_INVALID'
  | 'RECIPIENT_ACCOUNT_UNAVAILABLE'
  | 'PUSH_TOKEN_MISSING'
  | 'PUSH_TOKEN_INVALID'
  | 'PUSH_PROVIDER_TRANSIENT'
  | 'PUSH_PROVIDER_REJECTED'
  | 'PUSH_OUTCOME_AMBIGUOUS'
  | 'IN_APP_PERSISTENCE_FAILED'
  | 'RECIPIENT_ACCOUNT_DELETED';

export type SmartManagerPushResult =
  | { status: 'accepted'; providerTicketId?: string }
  | { status: 'permanent_token_failure'; code: 'PUSH_TOKEN_INVALID' }
  | { status: 'permanent_failure'; code: 'PUSH_PROVIDER_REJECTED' }
  | { status: 'ambiguous_failure'; code: 'PUSH_OUTCOME_AMBIGUOUS' }
  | {
      status: 'transient_failure';
      code: 'PUSH_PROVIDER_TRANSIENT' | 'PUSH_PROVIDER_REJECTED';
    };

export function buildSmartManagerDeliveryAttemptId(args: {
  campaignRunId: string;
  recipientKey: string;
  deliveryGeneration: number;
  attemptNumber: number;
  leaseGeneration: number;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-delivery-attempt-v1',
    ...args,
  });
}

export function buildSmartManagerDeliveryLeaseToken(args: {
  attemptId: string;
  claimedAt: number;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-delivery-lease-v1',
    ...args,
  });
}

export function buildSmartManagerInboxDedupeKey(args: {
  campaignRunId: string;
  recipientKey: string;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-in-app-delivery-v1',
    ...args,
  });
}

export function getSmartManagerPushBackoffMs(attemptCount: number) {
  const index = Math.max(
    0,
    Math.min(SMART_MANAGER_PUSH_BACKOFF_MS.length - 1, attemptCount - 1)
  );
  return SMART_MANAGER_PUSH_BACKOFF_MS[index];
}

export function sanitizeSmartManagerProviderTicketId(value: unknown) {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim();
  return /^[A-Za-z0-9_-]{1,160}$/.test(normalized)
    ? normalized
    : undefined;
}

export function classifySmartManagerExpoTicket(ticket: {
  status?: string;
  id?: string;
  details?: { error?: string };
}): SmartManagerPushResult {
  if (ticket.status === 'ok') {
    return {
      status: 'accepted',
      providerTicketId: sanitizeSmartManagerProviderTicketId(ticket.id),
    };
  }
  if (ticket.details?.error === 'DeviceNotRegistered') {
    return { status: 'permanent_token_failure', code: 'PUSH_TOKEN_INVALID' };
  }
  if (
    ticket.status === 'error' &&
    ticket.details?.error === 'MessageRateExceeded'
  ) {
    return { status: 'transient_failure', code: 'PUSH_PROVIDER_REJECTED' };
  }
  if (
    ticket.status === 'error' &&
    (ticket.details?.error === 'MessageTooBig' ||
      ticket.details?.error === 'MismatchSenderId' ||
      ticket.details?.error === 'InvalidCredentials')
  ) {
    return { status: 'permanent_failure', code: 'PUSH_PROVIDER_REJECTED' };
  }
  return { status: 'ambiguous_failure', code: 'PUSH_OUTCOME_AMBIGUOUS' };
}

export function isSmartManagerRecipientTerminal(state: string) {
  return (
    state === 'push_accepted' ||
    state === 'in_app_available' ||
    state === 'not_contactable' ||
    state === 'failed_terminal' ||
    state === 'invalidated'
  );
}
