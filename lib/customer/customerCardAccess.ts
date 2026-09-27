/**
 * Customer card access for an account that may also be owner, manager, staff,
 * or admin.
 *
 * memberships.byCustomer already returns only the signed-in user's memberships.
 * Role precedence in useRoleGuard must not hide that own card. A business role
 * without this membership still leaves the screen. Business authorization is
 * unchanged.
 *
 * While byCustomer is loading, ownership is unresolved. That is not the same
 * as a resolved list that does not contain the card.
 */
export function shouldWaitForOwnCustomerCardOwnership(input: {
  isPreviewMode: boolean;
  hasAuthenticatedUser: boolean;
  derivedRoleIsCustomer: boolean;
  membershipOwnershipResolved: boolean;
}): boolean {
  if (input.isPreviewMode || !input.hasAuthenticatedUser) {
    return false;
  }
  if (input.derivedRoleIsCustomer) {
    return false;
  }
  return !input.membershipOwnershipResolved;
}

export function shouldRedirectAwayFromOwnCustomerCard(input: {
  isPreviewMode: boolean;
  hasAuthenticatedUser: boolean;
  derivedRoleIsCustomer: boolean;
  membershipOwnershipResolved: boolean;
  membershipBelongsToCurrentUser: boolean;
}): boolean {
  if (input.isPreviewMode || !input.hasAuthenticatedUser) {
    return false;
  }
  if (input.derivedRoleIsCustomer) {
    return false;
  }
  if (!input.membershipOwnershipResolved) {
    return false;
  }
  return !input.membershipBelongsToCurrentUser;
}
