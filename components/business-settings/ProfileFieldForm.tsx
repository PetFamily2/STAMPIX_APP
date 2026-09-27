import { Ionicons } from '@expo/vector-icons';
import { type Ref, useState } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  SettingsBooleanChoices,
  SettingsChoiceList,
} from '@/components/business-settings/SettingsChoiceList';
import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import type { BusinessSettingsSnapshot } from '@/hooks/useBusinessSettingsProfile';
import {
  BUSINESS_EXAMPLE_OPTIONS,
  BUSINESS_NAME_MAX_LENGTH,
  BUSINESS_PHONE_MAX_LENGTH,
  type BusinessExampleId,
  type BusinessServiceType,
  DISCOVERY_SOURCES,
  type DiscoverySourceId,
  normalizeText,
  OWNER_AGE_RANGES,
  type OwnerAgeRangeId,
  PROFILE_FIELD_EDITOR_TITLES,
  PROFILE_FIELD_LABELS,
  type ProfileCompletionField,
  REASONS,
  type ReasonId,
  SERVICE_TAG_LIMIT,
  SERVICE_TYPES,
  SHORT_DESCRIPTION_MAX_LENGTH,
  USAGE_AREAS,
  type UsageAreaId,
} from '@/lib/businessSettings/profileFields';
import {
  canAddServiceTag,
  validateBusinessName,
  validateBusinessPhone,
  validateServiceTagDraft,
  validateShortDescription,
} from '@/lib/businessSettings/validation';
import { flexDirection, rtlBaseText, rtlBaseView } from '@/lib/rtl';

type ProfileFieldFormProps = {
  fields: ProfileCompletionField[];
  values: BusinessSettingsSnapshot;
  onChange: (next: BusinessSettingsSnapshot) => void;
  error?: string | null;
  editable?: boolean;
  anchoredField?: ProfileCompletionField | null;
  anchorRef?: Ref<View>;
  onAnchorLayout?: (y: number) => void;
};

export function ProfileFieldForm({
  fields,
  values,
  onChange,
  error,
  editable = true,
  anchoredField = null,
  anchorRef,
  onAnchorLayout,
}: ProfileFieldFormProps) {
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  const addTag = () => {
    if (!editable) {
      return;
    }
    const message = validateServiceTagDraft(tagDraft, values.serviceTags);
    if (message) {
      setTagError(message);
      return;
    }
    const normalized = normalizeText(tagDraft);
    if (!canAddServiceTag(normalized, values.serviceTags)) {
      setTagDraft('');
      setTagError(null);
      return;
    }
    onChange({
      ...values,
      serviceTags: [...values.serviceTags, normalized],
    });
    setTagDraft('');
    setTagError(null);
  };

  return (
    <View style={styles.form}>
      {fields.map((field) => {
        if (field === 'address') {
          return null;
        }
        const isAnchored = anchoredField === field;
        return (
          <View
            key={field}
            ref={isAnchored ? anchorRef : undefined}
            collapsable={false}
            onLayout={
              isAnchored
                ? (event) => onAnchorLayout?.(event.nativeEvent.layout.y)
                : undefined
            }
            style={styles.fieldBlock}
          >
            {field !== 'birthdayCampaignRelevant' &&
            field !== 'joinAnniversaryCampaignRelevant' &&
            field !== 'weakTimePromosRelevant' ? (
              <Text style={styles.label}>{PROFILE_FIELD_LABELS[field]}</Text>
            ) : null}

            {field === 'name' ? (
              <TextInput
                value={values.name}
                onChangeText={(name) => onChange({ ...values, name })}
                editable={editable}
                placeholder="שם העסק"
                placeholderTextColor={SETTINGS_TOKENS.textTertiary}
                maxLength={BUSINESS_NAME_MAX_LENGTH}
                accessibilityLabel={PROFILE_FIELD_LABELS.name}
                textAlignVertical="center"
                underlineColorAndroid="transparent"
                style={[styles.input, editable ? null : styles.inputReadOnly]}
              />
            ) : null}

            {field === 'shortDescription' ? (
              <TextInput
                value={values.shortDescription}
                onChangeText={(shortDescription) =>
                  onChange({ ...values, shortDescription })
                }
                editable={editable}
                placeholder="תיאור קצר של העסק"
                placeholderTextColor={SETTINGS_TOKENS.textTertiary}
                maxLength={SHORT_DESCRIPTION_MAX_LENGTH}
                multiline={true}
                textAlignVertical="top"
                underlineColorAndroid="transparent"
                accessibilityLabel={PROFILE_FIELD_LABELS.shortDescription}
                style={[
                  styles.input,
                  styles.multiline,
                  editable ? null : styles.inputReadOnly,
                ]}
              />
            ) : null}

            {field === 'businessPhone' ? (
              <TextInput
                value={values.businessPhone}
                onChangeText={(businessPhone) =>
                  onChange({ ...values, businessPhone })
                }
                editable={editable}
                placeholder="050-123-4567"
                placeholderTextColor={SETTINGS_TOKENS.textTertiary}
                keyboardType="phone-pad"
                maxLength={BUSINESS_PHONE_MAX_LENGTH}
                accessibilityLabel={PROFILE_FIELD_LABELS.businessPhone}
                textAlignVertical="center"
                underlineColorAndroid="transparent"
                style={[styles.input, editable ? null : styles.inputReadOnly]}
              />
            ) : null}

            {field === 'serviceTypes' ? (
              <>
                <Text style={styles.helper}>
                  בחרו לפחות סוג אחד, עד 6 סוגים.
                </Text>
                <SettingsChoiceList
                  multiple={true}
                  disabled={!editable}
                  options={SERVICE_TYPES}
                  selected={values.serviceTypes}
                  onSelect={(id) => {
                    const current = values.serviceTypes;
                    if (current.includes(id)) {
                      onChange({
                        ...values,
                        serviceTypes: current.filter((item) => item !== id),
                      });
                      return;
                    }
                    if (current.length >= 6) {
                      return;
                    }
                    onChange({
                      ...values,
                      serviceTypes: [...current, id as BusinessServiceType],
                    });
                  }}
                />
              </>
            ) : null}

            {field === 'serviceTags' ? (
              <>
                <Text style={styles.helper}>
                  הוסיפו לפחות תגית אחת, למשל קפה או מניקור.
                </Text>
                <View style={styles.tagRow}>
                  <TextInput
                    value={tagDraft}
                    onChangeText={(next) => {
                      setTagDraft(next);
                      setTagError(null);
                    }}
                    editable={editable}
                    placeholder="תגית חדשה"
                    placeholderTextColor={SETTINGS_TOKENS.textTertiary}
                    accessibilityLabel="תגית שירות חדשה"
                    onSubmitEditing={addTag}
                    textAlignVertical="center"
                    underlineColorAndroid="transparent"
                    style={[
                      styles.input,
                      styles.tagInput,
                      editable ? null : styles.inputReadOnly,
                    ]}
                  />
                  <Pressable
                    onPress={addTag}
                    accessibilityRole="button"
                    accessibilityLabel="הוספת תגית"
                    disabled={
                      !editable ||
                      values.serviceTags.length >= SERVICE_TAG_LIMIT
                    }
                    style={({ pressed }) => [
                      styles.addTagPressable,
                      pressed && editable ? styles.pressed : null,
                    ]}
                  >
                    <View
                      collapsable={false}
                      style={[
                        styles.addTag,
                        !editable ||
                        values.serviceTags.length >= SERVICE_TAG_LIMIT
                          ? styles.addTagDisabled
                          : null,
                      ]}
                    >
                      <Text style={styles.addTagLabel}>הוסף</Text>
                    </View>
                  </Pressable>
                </View>
                {tagError ? <Text style={styles.error}>{tagError}</Text> : null}
                <View style={styles.chips}>
                  {values.serviceTags.map((tag) => (
                    <Pressable
                      key={tag}
                      onPress={() => {
                        if (!editable) {
                          return;
                        }
                        onChange({
                          ...values,
                          serviceTags: values.serviceTags.filter(
                            (item) => item !== tag
                          ),
                        });
                      }}
                      disabled={!editable}
                      accessibilityRole="button"
                      accessibilityLabel={`הסרת תגית ${tag}`}
                      style={styles.chip}
                    >
                      <View style={styles.chipInner}>
                        <Ionicons
                          name="close"
                          size={14}
                          color={SETTINGS_TOKENS.accentText}
                        />
                        <Text style={styles.chipLabel}>{tag}</Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}

            {field === 'usageAreas' ? (
              <SettingsChoiceList
                multiple={true}
                disabled={!editable}
                options={USAGE_AREAS}
                selected={values.usageAreas}
                onSelect={(id) => {
                  const current = values.usageAreas;
                  onChange({
                    ...values,
                    usageAreas: current.includes(id)
                      ? current.filter((item) => item !== id)
                      : [...current, id as UsageAreaId],
                  });
                }}
              />
            ) : null}

            {field === 'businessExample' ? (
              <SettingsChoiceList
                disabled={!editable}
                options={BUSINESS_EXAMPLE_OPTIONS}
                selected={values.businessExample}
                onSelect={(id) =>
                  onChange({
                    ...values,
                    businessExample: id as BusinessExampleId,
                  })
                }
              />
            ) : null}

            {field === 'discoverySource' ? (
              <SettingsChoiceList
                disabled={!editable}
                options={DISCOVERY_SOURCES}
                selected={values.discoverySource}
                onSelect={(id) =>
                  onChange({
                    ...values,
                    discoverySource: id as DiscoverySourceId,
                  })
                }
              />
            ) : null}

            {field === 'reason' ? (
              <SettingsChoiceList
                disabled={!editable}
                options={REASONS}
                selected={values.reason}
                onSelect={(id) =>
                  onChange({ ...values, reason: id as ReasonId })
                }
              />
            ) : null}

            {field === 'ownerAgeRange' ? (
              <SettingsChoiceList
                disabled={!editable}
                options={OWNER_AGE_RANGES}
                selected={values.ownerAgeRange}
                onSelect={(id) =>
                  onChange({
                    ...values,
                    ownerAgeRange: id as OwnerAgeRangeId,
                  })
                }
              />
            ) : null}

            {field === 'birthdayCampaignRelevant' ? (
              <>
                <Text style={styles.label}>
                  {PROFILE_FIELD_EDITOR_TITLES.birthdayCampaignRelevant}
                </Text>
                <SettingsBooleanChoices
                  disabled={!editable}
                  value={values.birthdayCampaignRelevant}
                  onChange={(birthdayCampaignRelevant) =>
                    onChange({ ...values, birthdayCampaignRelevant })
                  }
                />
              </>
            ) : null}

            {field === 'joinAnniversaryCampaignRelevant' ? (
              <>
                <Text style={styles.label}>
                  {PROFILE_FIELD_EDITOR_TITLES.joinAnniversaryCampaignRelevant}
                </Text>
                <SettingsBooleanChoices
                  disabled={!editable}
                  value={values.joinAnniversaryCampaignRelevant}
                  onChange={(joinAnniversaryCampaignRelevant) =>
                    onChange({ ...values, joinAnniversaryCampaignRelevant })
                  }
                />
              </>
            ) : null}

            {field === 'weakTimePromosRelevant' ? (
              <>
                <Text style={styles.label}>
                  {PROFILE_FIELD_EDITOR_TITLES.weakTimePromosRelevant}
                </Text>
                <SettingsBooleanChoices
                  disabled={!editable}
                  value={values.weakTimePromosRelevant}
                  onChange={(weakTimePromosRelevant) =>
                    onChange({ ...values, weakTimePromosRelevant })
                  }
                />
              </>
            ) : null}
          </View>
        );
      })}
      {error ? (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function validateProfileFields(
  fields: ProfileCompletionField[],
  values: BusinessSettingsSnapshot
) {
  for (const field of fields) {
    if (field === 'name') {
      const message = validateBusinessName(values.name);
      if (message) {
        return message;
      }
    }
    if (field === 'shortDescription') {
      const message = validateShortDescription(values.shortDescription);
      if (message) {
        return message;
      }
    }
    if (field === 'businessPhone') {
      const message = validateBusinessPhone(values.businessPhone);
      if (message) {
        return message;
      }
    }
    if (field === 'serviceTypes' && values.serviceTypes.length === 0) {
      return 'יש לבחור לפחות סוג שירות אחד.';
    }
    if (field === 'serviceTags' && values.serviceTags.length === 0) {
      return 'יש להוסיף לפחות תגית שירות אחת.';
    }
    if (field === 'usageAreas' && values.usageAreas.length === 0) {
      return 'יש לבחור לפחות אזור פעילות אחד.';
    }
    if (field === 'businessExample' && !values.businessExample) {
      return 'יש לבחור תחום עסק.';
    }
    if (field === 'discoverySource' && !values.discoverySource) {
      return 'יש לבחור איך שמעתם עלינו.';
    }
    if (field === 'reason' && !values.reason) {
      return 'יש לבחור את המטרה העיקרית.';
    }
    if (field === 'ownerAgeRange' && !values.ownerAgeRange) {
      return 'יש לבחור טווח גיל.';
    }
    if (
      field === 'birthdayCampaignRelevant' &&
      values.birthdayCampaignRelevant === null
    ) {
      return 'יש לבחור האם מבצע יום הולדת רלוונטי.';
    }
    if (
      field === 'joinAnniversaryCampaignRelevant' &&
      values.joinAnniversaryCampaignRelevant === null
    ) {
      return 'יש לבחור האם מבצע יום הצטרפות רלוונטי.';
    }
    if (
      field === 'weakTimePromosRelevant' &&
      values.weakTimePromosRelevant === null
    ) {
      return 'יש לבחור האם מבצעי שעות/ימים חלשים רלוונטיים.';
    }
  }
  return null;
}

const styles = StyleSheet.create({
  form: {
    gap: 16,
  },
  fieldBlock: {
    gap: 8,
    alignItems: 'stretch',
  },
  label: {
    width: '100%',
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '700',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  helper: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  input: {
    width: '100%',
    minHeight: 52,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'android' ? 8 : 12,
    fontSize: 16,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textPrimary,
    ...rtlBaseText,
  },
  inputReadOnly: {
    backgroundColor: SETTINGS_TOKENS.surfaceMuted,
  },
  multiline: {
    minHeight: 120,
    paddingTop: 14,
    paddingBottom: 14,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  tagRow: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    ...rtlBaseView,
  },
  tagInput: {
    flex: 1,
  },
  addTagPressable: {
    minHeight: SETTINGS_TOKENS.touchTarget,
  },
  addTag: {
    minHeight: SETTINGS_TOKENS.touchTarget,
    minWidth: 72,
    borderRadius: 14,
    backgroundColor: SETTINGS_TOKENS.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  addTagDisabled: {
    opacity: 0.55,
  },
  addTagLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: SETTINGS_TOKENS.accentText,
  },
  chips: {
    width: '100%',
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 8,
    ...rtlBaseView,
  },
  chip: {
    maxWidth: '100%',
    borderRadius: 999,
    backgroundColor: SETTINGS_TOKENS.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  chipInner: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 6,
    ...rtlBaseView,
  },
  chipLabel: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: SETTINGS_TOKENS.accentText,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  error: {
    width: '100%',
    fontSize: 13,
    lineHeight: 18,
    color: SETTINGS_TOKENS.destructive,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.86,
  },
});
