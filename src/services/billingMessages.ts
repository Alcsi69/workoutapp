// Phase 7A — localized rendering of billing validation results.
//
// Keeps the i18n lookup out of the pure validator (src/services/billing.ts) while
// giving both the onboarding step and the Profil card one place to turn a
// BillingValidationResult into a human-readable Hungarian message.

import hu from '../i18n/hu';
import type { BillingValidationResult } from './billing';

/** "Teljes név: Kötelező mező. Email cím: Adj meg egy érvényes email címet." */
export function describeBillingErrors(result: BillingValidationResult): string {
  const parts: string[] = [];
  for (const field of result.missingFields) {
    parts.push(`${hu.billingFields[field]}: ${hu.validation.required}`);
  }
  if (result.invalidEmail) {
    parts.push(`${hu.billingFields.email}: ${hu.validation.invalidEmail}`);
  }
  return parts.join(' ');
}
