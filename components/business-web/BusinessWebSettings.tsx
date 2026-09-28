import {
  AlertTriangle,
  Building2,
  Check,
  MapPin,
  Plus,
  Save,
  Tags,
  X,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import BusinessAddressSelector from '@/components/business/BusinessAddressSelector';
import { validateProfileFields } from '@/components/business-settings';
import { useBusinessWebUnsavedChanges } from '@/components/business-web/BusinessWebRouteContext';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  type BusinessSettingsSnapshot,
  toBusinessSettingsSnapshot,
  useBusinessSettingsProfile,
} from '@/hooks/useBusinessSettingsProfile';
import {
  isValidSelectedBusinessAddress,
  type SelectedBusinessAddress,
} from '@/lib/businessAddressSelection';
import {
  BUSINESS_NAME_MAX_LENGTH,
  BUSINESS_PHONE_MAX_LENGTH,
  type BusinessServiceType,
  SERVICE_TAG_LIMIT,
  SERVICE_TYPES,
  SHORT_DESCRIPTION_MAX_LENGTH,
} from '@/lib/businessSettings/profileFields';
import {
  type AddressDraftText,
  addressDraftTextFromSelection,
  dirtyProfileDocumentFields,
  fieldsToValidateForSave,
  isProfileAddressDirty,
  revertedAddressDraft,
} from '@/lib/businessSettings/profileFormDraft';
import { canAddServiceTag } from '@/lib/businessSettings/validation';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { alignItems, flexDirection, ltrIslandText } from '@/lib/rtl';

function toSelectedAddress(
  settings:
    | {
        formattedAddress?: string;
        placeId?: string;
        location?: { lat?: number; lng?: number } | null;
        city?: string;
        street?: string;
        streetNumber?: string;
      }
    | null
    | undefined
): SelectedBusinessAddress | null {
  const formattedAddress = settings?.formattedAddress?.trim() ?? '';
  const placeId = settings?.placeId?.trim() ?? '';
  const lat = settings?.location?.lat;
  const lng = settings?.location?.lng;
  if (
    !formattedAddress ||
    !placeId ||
    typeof lat !== 'number' ||
    typeof lng !== 'number'
  ) {
    return null;
  }
  return {
    formattedAddress,
    placeId,
    latitude: lat,
    longitude: lng,
    city: settings?.city ?? '',
    street: settings?.street ?? '',
    streetNumber: settings?.streetNumber ?? '',
  };
}

function snapshotCopy(snapshot: BusinessSettingsSnapshot) {
  return {
    ...snapshot,
    serviceTypes: [...snapshot.serviceTypes],
    serviceTags: [...snapshot.serviceTags],
    usageAreas: [...snapshot.usageAreas],
  };
}

export function BusinessWebSettings() {
  const { width } = useWindowDimensions();
  const { activeBusiness, activeBusinessId } = useActiveBusiness();
  const profile = useBusinessSettingsProfile();
  const hydratedBusinessRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<BusinessSettingsSnapshot | null>(null);
  const [baseline, setBaseline] = useState<BusinessSettingsSnapshot | null>(
    null
  );
  const [loadedAddress, setLoadedAddress] =
    useState<SelectedBusinessAddress | null>(null);
  const [selectedAddress, setSelectedAddress] =
    useState<SelectedBusinessAddress | null>(null);
  const [addressQuery, setAddressQuery] = useState('');
  const [addressDraftText, setAddressDraftText] = useState<AddressDraftText>({
    cityText: '',
    streetText: '',
    houseNumber: '',
  });
  const [addressError, setAddressError] = useState<string | null>(null);
  const [addressRevision, setAddressRevision] = useState(0);
  const [tagDraft, setTagDraft] = useState('');
  const [formError, setFormError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [isSavingForm, setIsSavingForm] = useState(false);

  const settings = profile.businessSettings;
  const isCurrentSettings =
    settings?.businessId === activeBusinessId && activeBusinessId != null;

  useEffect(() => {
    if (!activeBusinessId) {
      hydratedBusinessRef.current = null;
      setDraft(null);
      setBaseline(null);
      setLoadedAddress(null);
      setSelectedAddress(null);
      setAddressQuery('');
      setAddressDraftText({ cityText: '', streetText: '', houseNumber: '' });
      setFormError('');
      setSaveNotice('');
      return;
    }
    if (
      !settings ||
      settings.businessId !== activeBusinessId ||
      hydratedBusinessRef.current === String(activeBusinessId)
    ) {
      return;
    }
    const nextDraft = toBusinessSettingsSnapshot(settings);
    const nextAddress = toSelectedAddress(settings);
    const reverted = revertedAddressDraft(nextAddress);
    hydratedBusinessRef.current = String(activeBusinessId);
    setDraft(snapshotCopy(nextDraft));
    setBaseline(snapshotCopy(nextDraft));
    setLoadedAddress(nextAddress);
    setSelectedAddress(reverted.selectedAddress);
    setAddressQuery(
      reverted.addressQuery || settings.formattedAddress?.trim() || ''
    );
    setAddressDraftText(reverted.draftText);
    setAddressRevision((current) => current + 1);
    setAddressError(null);
    setFormError('');
    setSaveNotice('');
  }, [activeBusinessId, settings]);

  const dirtyDocumentFields = useMemo(
    () =>
      draft && baseline ? dirtyProfileDocumentFields(draft, baseline) : [],
    [baseline, draft]
  );
  const addressDirty = useMemo(
    () =>
      isProfileAddressDirty(loadedAddress, selectedAddress, addressDraftText),
    [addressDraftText, loadedAddress, selectedAddress]
  );
  const isDirty = dirtyDocumentFields.length > 0 || addressDirty;

  const revertDraft = useCallback(() => {
    if (!baseline) {
      return;
    }
    const reverted = revertedAddressDraft(loadedAddress);
    setDraft(snapshotCopy(baseline));
    setSelectedAddress(reverted.selectedAddress);
    setAddressQuery(reverted.addressQuery);
    setAddressDraftText(reverted.draftText);
    setAddressRevision((current) => current + 1);
    setTagDraft('');
    setAddressError(null);
    setFormError('');
    setSaveNotice('');
  }, [baseline, loadedAddress]);

  useBusinessWebUnsavedChanges(
    isDirty && !isSavingForm && !profile.isSaving,
    revertDraft
  );

  const updateDraft = (
    updater: (current: BusinessSettingsSnapshot) => BusinessSettingsSnapshot
  ) => {
    setDraft((current) => (current ? updater(current) : current));
    setFormError('');
    setSaveNotice('');
  };

  const toggleServiceType = (serviceType: BusinessServiceType) => {
    if (!draft || !profile.canEditBusiness) {
      return;
    }
    updateDraft((current) => ({
      ...current,
      serviceTypes: current.serviceTypes.includes(serviceType)
        ? current.serviceTypes.filter((item) => item !== serviceType)
        : [...current.serviceTypes, serviceType],
    }));
  };

  const addTag = () => {
    if (
      !draft ||
      !profile.canEditBusiness ||
      !canAddServiceTag(tagDraft, draft.serviceTags)
    ) {
      return;
    }
    const normalized = tagDraft.trim().replace(/\s+/g, ' ');
    updateDraft((current) => ({
      ...current,
      serviceTags: [...current.serviceTags, normalized],
    }));
    setTagDraft('');
  };

  const loadLatest = () => {
    if (!settings || settings.businessId !== activeBusinessId) {
      return;
    }
    if (
      profile.conflictLocked &&
      profile.conflictServerUpdatedAt != null &&
      (typeof settings.updatedAt !== 'number' ||
        settings.updatedAt < profile.conflictServerUpdatedAt)
    ) {
      setFormError('הגרסה העדכנית עדיין נטענת. נסו שוב בעוד רגע.');
      return;
    }
    const nextDraft = toBusinessSettingsSnapshot(settings);
    const nextAddress = toSelectedAddress(settings);
    const reverted = revertedAddressDraft(nextAddress);
    profile.applyBusinessSettingsSnapshot();
    setDraft(snapshotCopy(nextDraft));
    setBaseline(snapshotCopy(nextDraft));
    setLoadedAddress(nextAddress);
    setSelectedAddress(reverted.selectedAddress);
    setAddressQuery(
      reverted.addressQuery || settings.formattedAddress?.trim() || ''
    );
    setAddressDraftText(reverted.draftText);
    setAddressRevision((current) => current + 1);
    setFormError('');
    setSaveNotice('');
  };

  const handleSave = async () => {
    if (
      !draft ||
      !baseline ||
      !profile.canEditBusiness ||
      profile.isSaving ||
      isSavingForm ||
      profile.conflictLocked ||
      !isDirty
    ) {
      return;
    }

    const validationError = validateProfileFields(
      fieldsToValidateForSave(dirtyDocumentFields, []),
      draft
    );
    if (validationError) {
      setFormError(validationError);
      setSaveNotice('');
      return;
    }
    if (addressDirty && !isValidSelectedBusinessAddress(selectedAddress)) {
      setFormError(
        'יש להשלים עיר, רחוב ומספר בית ולבחור כתובת תקינה לפני השמירה.'
      );
      setSaveNotice('');
      return;
    }

    setIsSavingForm(true);
    setFormError('');
    setSaveNotice('');
    let nextBaseline = snapshotCopy(baseline);
    try {
      if (dirtyDocumentFields.length > 0) {
        const result = await profile.saveProfileFields({
          name: draft.name,
          shortDescription: draft.shortDescription,
          businessPhone: draft.businessPhone,
          serviceTypes: draft.serviceTypes,
          serviceTags: draft.serviceTags,
        });
        if (result.conflict) {
          setFormError('הנתונים עודכנו במקום אחר. הטיוטה המקומית נשמרה.');
          return;
        }
        if (!result.ok) {
          setFormError(result.message ?? 'שמירת פרטי העסק נכשלה.');
          return;
        }
        nextBaseline = snapshotCopy(draft);
        setBaseline(nextBaseline);
      }

      if (addressDirty && selectedAddress) {
        const result = await profile.saveBusinessAddress(selectedAddress);
        if (result.conflict) {
          setFormError('הנתונים עודכנו במקום אחר. הטיוטה המקומית נשמרה.');
          return;
        }
        if (!result.ok) {
          setFormError(result.message ?? 'עדכון כתובת העסק נכשל.');
          return;
        }
        setLoadedAddress(selectedAddress);
        setAddressDraftText(addressDraftTextFromSelection(selectedAddress));
        nextBaseline = {
          ...nextBaseline,
          formattedAddress: selectedAddress.formattedAddress,
        };
        setBaseline(nextBaseline);
        setDraft((current) =>
          current
            ? {
                ...current,
                formattedAddress: selectedAddress.formattedAddress,
              }
            : current
        );
      }
      setSaveNotice('השינויים נשמרו בהצלחה.');
    } finally {
      setIsSavingForm(false);
    }
  };

  if (!activeBusinessId || !activeBusiness) {
    return (
      <PageState
        title="לא נבחר עסק פעיל"
        description="בחרו עסק כדי לצפות בפרופיל ובהגדרות שלו."
      />
    );
  }
  if (!isCurrentSettings || !draft || !baseline) {
    return (
      <View style={styles.pageState}>
        <ActivityIndicator color={TOKENS.colors.primary} size="large" />
        <Text style={styles.pageStateDescription}>טוענים את פרטי העסק…</Text>
      </View>
    );
  }

  const editable = profile.canEditBusiness;
  const isSaving = profile.isSaving || isSavingForm;
  const stacked = width < 1120;

  return (
    <View style={styles.page}>
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderCopy}>
          <Text style={styles.pageTitle}>הגדרות העסק</Text>
          <Text style={styles.pageSubtitle}>
            ניהול המידע שהלקוחות ו-StampAix משתמשים בו עבור העסק הזה.
          </Text>
        </View>
      </View>

      {!editable ? (
        <View style={styles.readOnlyBanner}>
          <Building2 color={TOKENS.colors.primary} size={20} />
          <View style={styles.bannerCopy}>
            <Text style={styles.bannerTitle}>תצוגה לקריאה בלבד</Text>
            <Text style={styles.bannerText}>
              אפשר לצפות בפרטי העסק, אבל רק בעלים או מנהל עם הרשאת עריכת פרופיל
              יכולים לשנות אותם.
            </Text>
          </View>
        </View>
      ) : null}

      {profile.conflictLocked ? (
        <View accessibilityLiveRegion="assertive" style={styles.conflictBanner}>
          <AlertTriangle color={TOKENS.colors.warning} size={22} />
          <View style={styles.bannerCopy}>
            <Text style={styles.conflictTitle}>הנתונים עודכנו במקום אחר</Text>
            <Text style={styles.conflictText}>
              לא דרסנו את הגרסה החדשה. הטיוטה המקומית נשארה על המסך עד שתבחרו
              לטעון את הנתונים העדכניים.
            </Text>
          </View>
          <Pressable
            accessibilityLabel="טעינת הגרסה העדכנית"
            accessibilityRole="button"
            onPress={loadLatest}
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={styles.secondaryButtonText}>טעינת גרסה עדכנית</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={[styles.contentGrid, stacked ? styles.contentGridStacked : null]}
      >
        <View style={styles.mainColumn}>
          <SettingsCard
            description="הפרטים הבסיסיים שמוצגים ללקוחות ומזהים את העסק."
            icon={Building2}
            title="פרטי העסק"
          >
            <FormField label="שם העסק">
              <TextInput
                accessibilityLabel="שם העסק"
                editable={editable && !isSaving}
                maxLength={BUSINESS_NAME_MAX_LENGTH}
                onChangeText={(name) =>
                  updateDraft((current) => ({ ...current, name }))
                }
                placeholder="שם העסק"
                placeholderTextColor={TOKENS.colors.textMuted}
                style={[styles.input, !editable ? styles.inputReadOnly : null]}
                value={draft.name}
              />
            </FormField>
            <FormField
              helper={`${draft.shortDescription.length}/${SHORT_DESCRIPTION_MAX_LENGTH}`}
              label="תיאור קצר"
            >
              <TextInput
                accessibilityLabel="תיאור קצר של העסק"
                editable={editable && !isSaving}
                maxLength={SHORT_DESCRIPTION_MAX_LENGTH}
                multiline={true}
                onChangeText={(shortDescription) =>
                  updateDraft((current) => ({
                    ...current,
                    shortDescription,
                  }))
                }
                placeholder="מה הלקוחות צריכים לדעת על העסק?"
                placeholderTextColor={TOKENS.colors.textMuted}
                style={[
                  styles.input,
                  styles.textArea,
                  !editable ? styles.inputReadOnly : null,
                ]}
                value={draft.shortDescription}
              />
            </FormField>
            <FormField label="טלפון עסקי">
              <TextInput
                accessibilityLabel="טלפון עסקי"
                editable={editable && !isSaving}
                keyboardType="phone-pad"
                maxLength={BUSINESS_PHONE_MAX_LENGTH}
                onChangeText={(businessPhone) =>
                  updateDraft((current) => ({ ...current, businessPhone }))
                }
                placeholder="03-0000000"
                placeholderTextColor={TOKENS.colors.textMuted}
                style={[
                  styles.input,
                  styles.ltrInput,
                  !editable ? styles.inputReadOnly : null,
                ]}
                value={draft.businessPhone}
              />
            </FormField>
          </SettingsCard>

          <SettingsCard
            description="בחירת תחומים ותגיות עוזרת לתאר את השירותים של העסק."
            icon={Tags}
            title="תחומי פעילות"
          >
            <FormField label="סוגי שירות">
              <View style={styles.optionGrid}>
                {SERVICE_TYPES.map((serviceType) => {
                  const selected = draft.serviceTypes.includes(serviceType.id);
                  return (
                    <Pressable
                      accessibilityLabel={serviceType.label}
                      accessibilityRole="checkbox"
                      accessibilityState={{
                        checked: selected,
                        disabled: !editable,
                      }}
                      disabled={!editable || isSaving}
                      key={serviceType.id}
                      onPress={() => toggleServiceType(serviceType.id)}
                      style={({ pressed }) => [
                        styles.optionChip,
                        selected ? styles.optionChipSelected : null,
                        pressed ? styles.pressed : null,
                      ]}
                    >
                      {selected ? (
                        <Check color={TOKENS.colors.primary} size={16} />
                      ) : null}
                      <Text
                        style={[
                          styles.optionChipText,
                          selected ? styles.optionChipTextSelected : null,
                        ]}
                      >
                        {serviceType.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </FormField>
            <FormField
              helper={`עד ${SERVICE_TAG_LIMIT} תגיות`}
              label="תגיות שירות"
            >
              {draft.serviceTags.length > 0 ? (
                <View style={styles.tagsList}>
                  {draft.serviceTags.map((tag) => (
                    <View key={tag} style={styles.tagChip}>
                      <Text style={styles.tagText}>{tag}</Text>
                      {editable ? (
                        <Pressable
                          accessibilityLabel={`הסרת התגית ${tag}`}
                          accessibilityRole="button"
                          disabled={isSaving}
                          onPress={() =>
                            updateDraft((current) => ({
                              ...current,
                              serviceTags: current.serviceTags.filter(
                                (item) => item !== tag
                              ),
                            }))
                          }
                          style={styles.tagRemove}
                        >
                          <X color={TOKENS.colors.primary} size={14} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : null}
              {editable ? (
                <View style={styles.tagInputRow}>
                  <TextInput
                    accessibilityLabel="תגית שירות חדשה"
                    editable={!isSaving}
                    onChangeText={setTagDraft}
                    onSubmitEditing={addTag}
                    placeholder="לדוגמה: משלוחים"
                    placeholderTextColor={TOKENS.colors.textMuted}
                    style={[styles.input, styles.tagInput]}
                    value={tagDraft}
                  />
                  <Pressable
                    accessibilityLabel="הוספת תגית"
                    accessibilityRole="button"
                    accessibilityState={{
                      disabled:
                        !canAddServiceTag(tagDraft, draft.serviceTags) ||
                        isSaving,
                    }}
                    disabled={
                      !canAddServiceTag(tagDraft, draft.serviceTags) || isSaving
                    }
                    onPress={addTag}
                    style={({ pressed }) => [
                      styles.addTagButton,
                      pressed ? styles.pressed : null,
                    ]}
                  >
                    <Plus color="#FFFFFF" size={18} />
                  </Pressable>
                </View>
              ) : null}
            </FormField>
          </SettingsCard>
        </View>

        <View style={styles.addressColumn}>
          <SettingsCard
            description="הכתובת משמשת להצגת העסק ולחיפוש מקומי. לא נבקש מיקום מהמכשיר."
            icon={MapPin}
            title="כתובת העסק"
          >
            <BusinessAddressSelector
              disabled={!editable || isSaving}
              errorText={addressError}
              key={`${String(activeBusinessId)}-${addressRevision}`}
              onDraftChange={setAddressDraftText}
              onError={setAddressError}
              onQueryChange={setAddressQuery}
              onSelectedAddressChange={setSelectedAddress}
              query={addressQuery}
              selectedAddress={selectedAddress}
            />
          </SettingsCard>
        </View>
      </View>

      {formError ? (
        <View accessibilityLiveRegion="assertive" style={styles.errorBanner}>
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}
      {saveNotice ? (
        <View accessibilityLiveRegion="polite" style={styles.successBanner}>
          <Check color={TOKENS.colors.success} size={20} />
          <Text style={styles.successText}>{saveNotice}</Text>
        </View>
      ) : null}

      {editable ? (
        <View style={styles.saveBar}>
          <View style={styles.saveBarCopy}>
            <Text style={styles.saveBarTitle}>
              {isDirty ? 'יש שינויים שלא נשמרו' : 'הפרטים מעודכנים'}
            </Text>
            <Text style={styles.saveBarText}>
              {isDirty
                ? 'השינויים נשמרים רק לאחר לחיצה על שמירה.'
                : 'אין שינויים חדשים לשמירה.'}
            </Text>
          </View>
          {isDirty ? (
            <Pressable
              accessibilityLabel="ביטול השינויים"
              accessibilityRole="button"
              accessibilityState={{ disabled: isSaving }}
              disabled={isSaving}
              onPress={revertDraft}
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.secondaryButtonText}>ביטול שינויים</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="שמירת פרטי העסק"
            accessibilityRole="button"
            accessibilityState={{
              busy: isSaving,
              disabled: !isDirty || isSaving || profile.conflictLocked,
            }}
            disabled={!isDirty || isSaving || profile.conflictLocked}
            onPress={() => void handleSave()}
            style={({ pressed }) => [
              styles.primaryButton,
              !isDirty || profile.conflictLocked
                ? styles.primaryButtonDisabled
                : null,
              pressed ? styles.pressed : null,
            ]}
          >
            {isSaving ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <Save color="#FFFFFF" size={18} />
            )}
            <Text style={styles.primaryButtonText}>
              {isSaving ? 'שומרים…' : 'שמירת שינויים'}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function SettingsCard({
  children,
  description,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  description: string;
  icon: typeof Building2;
  title: string;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.cardIcon}>
          <Icon color={TOKENS.colors.primary} size={21} />
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{title}</Text>
          <Text style={styles.cardDescription}>{description}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function FormField({
  children,
  helper,
  label,
}: {
  children: React.ReactNode;
  helper?: string;
  label: string;
}) {
  return (
    <View style={styles.formField}>
      <View style={styles.formLabelRow}>
        <Text style={styles.formLabel}>{label}</Text>
        {helper ? <Text style={styles.formHelper}>{helper}</Text> : null}
      </View>
      {children}
    </View>
  );
}

function PageState({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <View style={styles.pageState}>
      <View style={styles.pageStateIcon}>
        <Building2 color={TOKENS.colors.primary} size={26} />
      </View>
      <Text style={styles.pageStateTitle}>{title}</Text>
      <Text style={styles.pageStateDescription}>{description}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    alignSelf: 'center',
    gap: TOKENS.space.xl,
    maxWidth: 1180,
    width: '100%',
  },
  pageHeader: { flexDirection: flexDirection.row },
  pageHeaderCopy: { flex: 1, gap: TOKENS.space.xs },
  pageTitle: {
    ...TOKENS.typography.pageTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pageSubtitle: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  readOnlyBanner: {
    alignItems: alignItems.start,
    backgroundColor: TOKENS.colors.primarySubtle,
    borderColor: '#D9E4FF',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    padding: TOKENS.space.lg,
  },
  conflictBanner: {
    alignItems: alignItems.start,
    backgroundColor: TOKENS.colors.warningSubtle,
    borderColor: '#FED7AA',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
    padding: TOKENS.space.lg,
  },
  bannerCopy: { flex: 1, gap: TOKENS.space.xs, minWidth: 220 },
  bannerTitle: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.primary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  bannerText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  conflictTitle: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.warning,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  conflictText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.warning,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  contentGrid: {
    alignItems: alignItems.stretch,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.xl,
  },
  contentGridStacked: { flexDirection: 'column' },
  mainColumn: { flex: 1.35, gap: TOKENS.space.xl, minWidth: 0, width: '100%' },
  addressColumn: { flex: 1, minWidth: 0, width: '100%' },
  card: {
    ...TOKENS.shadow,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: TOKENS.space.xl,
    width: '100%',
  },
  cardHeader: {
    alignItems: alignItems.start,
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    paddingBottom: TOKENS.space.lg,
  },
  cardIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.md,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  cardHeaderCopy: { flex: 1, gap: 2 },
  cardTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardDescription: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cardBody: { gap: TOKENS.space.xl, paddingTop: TOKENS.space.xl },
  formField: { gap: TOKENS.space.sm },
  formLabelRow: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
  },
  formLabel: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  formHelper: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted },
  input: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    color: TOKENS.colors.textPrimary,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: TOKENS.space.lg,
    paddingVertical: TOKENS.space.md,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  inputReadOnly: {
    backgroundColor: TOKENS.colors.subtleSurface,
    color: TOKENS.colors.textSecondary,
  },
  textArea: { minHeight: 112, textAlignVertical: 'top' },
  ltrInput: { ...ltrIslandText },
  optionGrid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.sm,
  },
  optionChip: {
    alignItems: 'center',
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.pill,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.xs,
    minHeight: 40,
    paddingHorizontal: TOKENS.space.md,
  },
  optionChipSelected: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderColor: TOKENS.colors.primary,
  },
  optionChipText: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textSecondary,
  },
  optionChipTextSelected: { color: TOKENS.colors.primary },
  tagsList: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.sm,
  },
  tagChip: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.xs,
    minHeight: 34,
    paddingHorizontal: TOKENS.space.md,
  },
  tagText: { ...TOKENS.typography.metadata, color: TOKENS.colors.primary },
  tagRemove: {
    alignItems: 'center',
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  tagInputRow: {
    alignItems: 'stretch',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
  },
  tagInput: { flex: 1 },
  addTagButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.sm,
    justifyContent: 'center',
    minWidth: 48,
  },
  errorBanner: {
    backgroundColor: TOKENS.colors.dangerSubtle,
    borderColor: '#FECACA',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    padding: TOKENS.space.lg,
  },
  errorText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.danger,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  successBanner: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.successSubtle,
    borderColor: '#A7F3D0',
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    padding: TOKENS.space.lg,
  },
  successText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.success,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  saveBar: {
    ...TOKENS.shadow,
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
    padding: TOKENS.space.lg,
  },
  saveBarCopy: { flex: 1, minWidth: 210 },
  saveBarTitle: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  saveBarText: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primary,
    borderRadius: TOKENS.radii.sm,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 148,
    paddingHorizontal: TOKENS.space.lg,
  },
  primaryButtonDisabled: { opacity: 0.48 },
  primaryButtonText: { ...TOKENS.typography.label, color: '#FFFFFF' },
  secondaryButton: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.sm,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: TOKENS.space.lg,
  },
  secondaryButtonText: {
    ...TOKENS.typography.label,
    color: TOKENS.colors.textSecondary,
  },
  pressed: { opacity: 0.82 },
  pageState: {
    ...TOKENS.shadow,
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    gap: TOKENS.space.md,
    justifyContent: 'center',
    maxWidth: 620,
    minHeight: 320,
    padding: TOKENS.space.xxl,
    width: '100%',
  },
  pageStateIcon: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: TOKENS.radii.pill,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  pageStateTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pageStateDescription: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textSecondary,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
