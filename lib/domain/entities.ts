import type { AppRole, BusinessStaffRole } from './roles';

export type Id<T extends string> = string & { __brand: T };

export type User = {
  id: Id<'users'>;
  name?: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  role: AppRole;
  isActive: boolean;
  createdAt: number;
};

export type Business = {
  id: Id<'businesses'>;
  ownerId: Id<'users'>;
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  isActive: boolean;
  isDiscoverable: boolean;
  createdAt: number;
};

export type BusinessStaff = {
  id: Id<'businessStaff'>;
  businessId: Id<'businesses'>;
  userId: Id<'users'>;
  staffRole: BusinessStaffRole; // owner | staff
  isActive: boolean;
  createdAt: number;
};

export type LoyaltyProgram = {
  id: Id<'loyaltyPrograms'>;
  businessId: Id<'businesses'>;
  title: string; // e.g. "Coffee Club"
  rewardName: string; // e.g. "Free Coffee"
  maxStamps: number; // e.g. 10
  stampIcon: string; // e.g. "coffee"
  isActive: boolean;
  createdAt: number;
};

export type Membership = {
  id: Id<'memberships'>;
  userId: Id<'users'>;
  businessId: Id<'businesses'>;
  programId: Id<'loyaltyPrograms'>;
  currentStamps: number;
  cycle: number; // increments after redemption
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
};

export type EventType =
  | 'STAMP_ADDED'
  | 'REWARD_REDEEMED'
  | 'PROGRAM_UPDATED'
  | 'BUSINESS_UPDATED'
  | 'STAFF_ADDED'
  | 'STAFF_REMOVED';

export type AuditEvent = {
  id: Id<'events'>;
  type: EventType;
  actorUserId: Id<'users'>;
  businessId?: Id<'businesses'>;
  membershipId?: Id<'memberships'>;
  programId?: Id<'loyaltyPrograms'>;
  stampCount?: number;
  note?: string;
  source: 'app' | 'admin' | 'api';
  correlationId?: string;
  createdAt: number;
};
