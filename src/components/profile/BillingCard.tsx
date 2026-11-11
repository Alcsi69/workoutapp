import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from '../Button';
import { Card } from '../Card';
import { Chip } from '../Badge';
import { TextField } from '../TextField';
import { getDatabase } from '../../db/client';
import { saveClientBillingProfile, USER_PROFILE_ID } from '../../db/repository';
import { resolveBillingName, validateClientBillingProfile } from '../../services/billing';
import { describeBillingErrors } from '../../services/billingMessages';
import hu from '../../i18n/hu';
import { colors, spacing, typography } from '../../theme/tokens';
import type { ClientBillingProfile, ClientBillingProfileInput } from '../../types/workout';
import { DEFAULT_BILLING_COUNTRY } from '../../types/workout';

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  billingSameAsFullName: boolean;
  billingName: string;
  billingCountry: string;
  billingZip: string;
  billingCity: string;
  billingAddress: string;
  taxNumber: string;
}

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  billingSameAsFullName: true,
  billingName: '',
  billingCountry: DEFAULT_BILLING_COUNTRY,
  billingZip: '',
  billingCity: '',
  billingAddress: '',
  taxNumber: '',
};

function toForm(profile: ClientBillingProfile): FormState {
  return {
    fullName: profile.fullName,
    email: profile.email,
    phone: profile.phone,
    billingSameAsFullName: profile.billingName === profile.fullName,
    billingName: profile.billingName,
    billingCountry: profile.billingCountry,
    billingZip: profile.billingZip,
    billingCity: profile.billingCity,
    billingAddress: profile.billingAddress,
    taxNumber: profile.taxNumber ?? '',
  };
}

function toInput(form: FormState): ClientBillingProfileInput {
  const input: ClientBillingProfileInput = {
    userId: USER_PROFILE_ID,
    fullName: form.fullName,
    email: form.email,
    phone: form.phone,
    billingName: resolveBillingName(form.fullName, form.billingSameAsFullName, form.billingName),
    billingCountry: form.billingCountry,
    billingZip: form.billingZip,
    billingCity: form.billingCity,
    billingAddress: form.billingAddress,
  };
  if (form.taxNumber.trim().length > 0) {
    input.taxNumber = form.taxNumber;
  }
  return input;
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

/**
 * Editable "Kapcsolat & Számlázási adatok" card for the Profil tab: reads the
 * saved billing profile, shows it read-only, and lets the client edit and
 * re-validate it (the same rules the onboarding step enforces).
 */
export function BillingCard({
  profile,
  onSaved,
}: {
  profile: ClientBillingProfile | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(profile === null ? EMPTY_FORM : toForm(profile));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const startEditing = useCallback(() => {
    setForm(profile === null ? EMPTY_FORM : toForm(profile));
    setError(null);
    setEditing(true);
  }, [profile]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setError(null);
    const input = toInput(form);
    const validation = validateClientBillingProfile(input);
    if (!validation.valid) {
      setError(describeBillingErrors(validation));
      return;
    }
    setSaving(true);
    try {
      const db = await getDatabase();
      await saveClientBillingProfile(db, input);
      setEditing(false);
      onSaved();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }, [form, onSaved]);

  const update = (patch: Partial<FormState>): void => {
    setForm((previous) => ({ ...previous, ...patch }));
  };

  if (editing) {
    return (
      <Card title={hu.screens.profile.contactBilling} caption={hu.screens.profile.contactBillingHint}>
        <TextField
          label={hu.onboarding.contact.fullName}
          value={form.fullName}
          onChange={(value) => update({ fullName: value })}
          placeholder={hu.onboarding.contact.fullNamePlaceholder}
          autoCapitalize="words"
        />
        <TextField
          label={hu.onboarding.contact.email}
          value={form.email}
          onChange={(value) => update({ email: value })}
          placeholder={hu.onboarding.contact.emailPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          label={hu.onboarding.contact.phone}
          value={form.phone}
          onChange={(value) => update({ phone: value })}
          placeholder={hu.onboarding.contact.phonePlaceholder}
          keyboardType="phone-pad"
        />

        <View style={styles.toggleRow}>
          <Chip
            label={hu.onboarding.billing.sameAsFullName}
            selected={form.billingSameAsFullName}
            onPress={() => update({ billingSameAsFullName: !form.billingSameAsFullName })}
          />
        </View>
        {!form.billingSameAsFullName ? (
          <TextField
            label={hu.onboarding.billing.billingName}
            value={form.billingName}
            onChange={(value) => update({ billingName: value })}
            placeholder={hu.onboarding.billing.billingNamePlaceholder}
            autoCapitalize="words"
          />
        ) : null}
        <TextField
          label={hu.onboarding.billing.country}
          value={form.billingCountry}
          onChange={(value) => update({ billingCountry: value })}
          autoCapitalize="words"
        />
        <TextField
          label={hu.onboarding.billing.zip}
          value={form.billingZip}
          onChange={(value) => update({ billingZip: value })}
          placeholder={hu.onboarding.billing.zipPlaceholder}
          keyboardType="number-pad"
        />
        <TextField
          label={hu.onboarding.billing.city}
          value={form.billingCity}
          onChange={(value) => update({ billingCity: value })}
          placeholder={hu.onboarding.billing.cityPlaceholder}
          autoCapitalize="words"
        />
        <TextField
          label={hu.onboarding.billing.address}
          value={form.billingAddress}
          onChange={(value) => update({ billingAddress: value })}
          placeholder={hu.onboarding.billing.addressPlaceholder}
        />
        <TextField
          label={hu.onboarding.billing.taxNumber}
          value={form.taxNumber}
          onChange={(value) => update({ taxNumber: value })}
          placeholder={hu.onboarding.billing.taxNumberPlaceholder}
          hint={hu.onboarding.billing.taxNumberHint}
          autoCapitalize="none"
        />

        {error !== null ? <Text style={styles.error}>{error}</Text> : null}
        <Button
          label={hu.common.save}
          onPress={() => {
            void save();
          }}
          loading={saving}
        />
        <Button label={hu.common.cancel} variant="ghost" onPress={cancelEditing} />
      </Card>
    );
  }

  return (
    <Card title={hu.screens.profile.contactBilling} caption={hu.screens.profile.contactBillingHint}>
      {profile === null ? (
        <>
          <Text style={styles.muted}>{hu.screens.profile.noBilling}</Text>
          <Button label={hu.screens.profile.addBilling} onPress={startEditing} />
        </>
      ) : (
        <>
          <Text style={styles.sectionLabel}>{hu.screens.profile.contact}</Text>
          <ReadRow label={hu.onboarding.contact.fullName} value={profile.fullName} />
          <ReadRow label={hu.onboarding.contact.email} value={profile.email} />
          <ReadRow label={hu.onboarding.contact.phone} value={profile.phone} />

          <Text style={styles.sectionLabel}>{hu.screens.profile.billing}</Text>
          <ReadRow label={hu.onboarding.billing.billingName} value={profile.billingName} />
          <ReadRow
            label={hu.onboarding.billing.zip}
            value={`${profile.billingZip} ${profile.billingCity}`}
          />
          <ReadRow label={hu.onboarding.billing.address} value={profile.billingAddress} />
          <ReadRow label={hu.onboarding.billing.country} value={profile.billingCountry} />
          {profile.taxNumber !== undefined ? (
            <ReadRow label={hu.onboarding.billing.taxNumber} value={profile.taxNumber} />
          ) : null}

          <Button label={hu.screens.profile.edit} variant="secondary" onPress={startEditing} />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  rowLabel: {
    color: colors.textSecondary,
    fontSize: typography.sizes.sm,
  },
  rowValue: {
    flexShrink: 1,
    color: colors.textPrimary,
    fontSize: typography.sizes.sm,
    fontWeight: typography.weights.medium,
    textAlign: 'right',
  },
  sectionLabel: {
    marginTop: spacing.sm,
    color: colors.textMuted,
    fontSize: typography.sizes.xs,
    fontWeight: typography.weights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  muted: {
    color: colors.textMuted,
    fontSize: typography.sizes.sm,
  },
  error: {
    color: colors.danger,
    fontSize: typography.sizes.sm,
  },
});
