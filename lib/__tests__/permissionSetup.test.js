import { describe, expect, test } from 'bun:test';
import {
  permissionPlan,
  runPermissionSetup,
} from '../web-permissions/permissionSetup';

describe('role-aware permission activation', () => {
  test('a customer is never offered camera or microphone access', () => {
    expect(permissionPlan('customer')).toEqual(['notifications', 'location']);
    expect(permissionPlan('business')).toEqual([
      'notifications',
      'camera',
      'location',
    ]);
  });
  test('notifications start synchronously in the click; refusal does not block camera or location', async () => {
    const calls = [];
    const results = [];
    const task = runPermissionSetup(permissionPlan('business'), {
      valid: () => true,
      notifications: () => {
        calls.push('notifications');
        return Promise.resolve(false);
      },
      camera: async () => {
        calls.push('camera');
        throw new Error('denied');
      },
      location: async () => {
        calls.push('location');
      },
      result: (...args) => results.push(args),
    });
    expect(calls).toEqual(['notifications']);
    await task;
    expect(calls).toEqual(['notifications', 'camera', 'location']);
    expect(results).toEqual([
      ['notifications', 'incomplete'],
      ['camera', 'incomplete'],
      ['location', 'ready'],
    ]);
  });
  test('a browser grant without account subscription is not a successful Push connection', async () => {
    const results = [];
    await runPermissionSetup(['notifications'], {
      valid: () => true,
      notifications: async () => undefined,
      camera: async () => {
        throw new Error('not selected');
      },
      location: async () => {
        throw new Error('not selected');
      },
      result: (...args) => results.push(args),
    });
    expect(results).toEqual([['notifications', 'incomplete']]);
  });
  test('navigation or account change cancels subsequent prompts and stale UI results', async () => {
    let valid = true;
    const results = [];
    await runPermissionSetup(permissionPlan('business'), {
      valid: () => valid,
      notifications: async () => {
        valid = false;
        return true;
      },
      camera: async () => {
        throw new Error('must not request camera');
      },
      location: async () => {
        throw new Error('must not request location');
      },
      result: (...args) => results.push(args),
    });
    expect(results).toEqual([]);
  });
  test('unchecked permissions are not requested', async () => {
    const calls = [];
    await runPermissionSetup(['location'], {
      valid: () => true,
      notifications: async () => {
        calls.push('notifications');
        return true;
      },
      camera: async () => {
        calls.push('camera');
      },
      location: async () => {
        calls.push('location');
      },
      result: () => {},
    });
    expect(calls).toEqual(['location']);
  });
});

