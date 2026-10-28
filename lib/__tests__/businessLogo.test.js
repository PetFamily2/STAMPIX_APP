import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

describe('business logo web profile', () => {
  test('web settings upload the business logo separately from card images', () => {
    const settings = readFileSync(
      'components/business-web/BusinessWebSettings.tsx',
      'utf8'
    );
    const field = readFileSync(
      'components/business-web/BusinessLogoField.tsx',
      'utf8'
    );
    const nativeSettings = readFileSync(
      'screens/BusinessSettingsScreen.tsx',
      'utf8'
    );

    expect(settings).toContain('BusinessLogoField');
    expect(field).toContain('generateBusinessLogoUploadUrl');
    expect(field).toContain('setBusinessLogo');
    expect(field).toContain('canEdit');
    expect(field).not.toContain('generateProgramImageUploadUrl');
    expect(field).not.toContain('imageStorageId');
    expect(nativeSettings).not.toContain('BusinessLogoField');
    expect(nativeSettings).not.toContain('setBusinessLogo');
  });

  test('web identity headers use the saved logo and keep the business name', () => {
    const shell = readFileSync(
      'components/business-web/BusinessWebShell.tsx',
      'utf8'
    );
    const customer = readFileSync(
      'app/(authenticated)/(customer)/business/[businessId].tsx',
      'utf8'
    );

    expect(shell).toContain('logoUrl');
    expect(shell).toContain('BusinessIdentityMark');
    expect(shell).toContain('activeBusiness?.name');
    expect(customer).toContain("Platform.OS === 'web' && business.logoUrl");
    expect(customer).toContain('businessLogoUrl={business.logoUrl}');
    expect(customer).toContain('title={business.name}');
  });
});
