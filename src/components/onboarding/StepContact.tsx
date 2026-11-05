import { StyleSheet, View } from 'react-native';
import { Card } from '../Card';
import { Chip } from '../Badge';
import { TextField } from '../TextField';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import hu from '../../i18n/hu';
import { spacing } from '../../theme/tokens';

/** Step 4 — Kapcsolat & Számlázási adatok. */
export function StepContact() {
  const fullName = useOnboardingStore((state) => state.fullName);
  const email = useOnboardingStore((state) => state.email);
  const phone = useOnboardingStore((state) => state.phone);
  const billingSameAsFullName = useOnboardingStore((state) => state.billingSameAsFullName);
  const billingName = useOnboardingStore((state) => state.billingName);
  const billingCountry = useOnboardingStore((state) => state.billingCountry);
  const billingZip = useOnboardingStore((state) => state.billingZip);
  const billingCity = useOnboardingStore((state) => state.billingCity);
  const billingAddress = useOnboardingStore((state) => state.billingAddress);
  const taxNumber = useOnboardingStore((state) => state.taxNumber);
  const updateContact = useOnboardingStore((state) => state.updateContact);
  const updateBilling = useOnboardingStore((state) => state.updateBilling);

  return (
    <View style={styles.container}>
      <Card title={hu.onboarding.contact.title} caption={hu.onboarding.contact.subtitle}>
        <TextField
          label={hu.onboarding.contact.fullName}
          value={fullName}
          onChange={(value) => updateContact({ fullName: value })}
          placeholder={hu.onboarding.contact.fullNamePlaceholder}
          autoCapitalize="words"
        />
        <TextField
          label={hu.onboarding.contact.email}
          value={email}
          onChange={(value) => updateContact({ email: value })}
          placeholder={hu.onboarding.contact.emailPlaceholder}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextField
          label={hu.onboarding.contact.phone}
          value={phone}
          onChange={(value) => updateContact({ phone: value })}
          placeholder={hu.onboarding.contact.phonePlaceholder}
          keyboardType="phone-pad"
        />
      </Card>

      <Card title={hu.onboarding.billing.title} caption={hu.onboarding.billing.subtitle}>
        <View style={styles.toggleRow}>
          <Chip
            label={hu.onboarding.billing.sameAsFullName}
            selected={billingSameAsFullName}
            onPress={() => updateBilling({ billingSameAsFullName: !billingSameAsFullName })}
          />
        </View>

        {!billingSameAsFullName ? (
          <TextField
            label={hu.onboarding.billing.billingName}
            value={billingName}
            onChange={(value) => updateBilling({ billingName: value })}
            placeholder={hu.onboarding.billing.billingNamePlaceholder}
            autoCapitalize="words"
          />
        ) : null}

        <TextField
          label={hu.onboarding.billing.country}
          value={billingCountry}
          onChange={(value) => updateBilling({ billingCountry: value })}
          autoCapitalize="words"
        />
        <View style={styles.row}>
          <View style={styles.zipField}>
            <TextField
              label={hu.onboarding.billing.zip}
              value={billingZip}
              onChange={(value) => updateBilling({ billingZip: value })}
              placeholder={hu.onboarding.billing.zipPlaceholder}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.cityField}>
            <TextField
              label={hu.onboarding.billing.city}
              value={billingCity}
              onChange={(value) => updateBilling({ billingCity: value })}
              placeholder={hu.onboarding.billing.cityPlaceholder}
              autoCapitalize="words"
            />
          </View>
        </View>
        <TextField
          label={hu.onboarding.billing.address}
          value={billingAddress}
          onChange={(value) => updateBilling({ billingAddress: value })}
          placeholder={hu.onboarding.billing.addressPlaceholder}
        />
        <TextField
          label={hu.onboarding.billing.taxNumber}
          value={taxNumber}
          onChange={(value) => updateBilling({ taxNumber: value })}
          placeholder={hu.onboarding.billing.taxNumberPlaceholder}
          hint={hu.onboarding.billing.taxNumberHint}
          autoCapitalize="none"
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  zipField: {
    flex: 1,
  },
  cityField: {
    flex: 2,
  },
});
