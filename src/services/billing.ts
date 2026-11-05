// Phase 7A — client contact & Hungarian billing/invoicing validation.
//
// Pure, framework-free helpers shared by the onboarding "Kapcsolat & Számlázási
// adatok" step and the editable Profil card, so both validate identically before
// persisting through `saveClientBillingProfile`. Messages are NOT produced here:
// the validator returns which fields are missing/invalid and the UI maps them to
// localized strings from src/i18n/hu.ts.

import type { ClientBillingProfileInput } from '../types/workout';
import { DEFAULT_BILLING_COUNTRY } from '../types/workout';

/** Fields that must be filled before a billing profile can be saved. */
export type BillingFieldKey =
  | 'fullName'
  | 'email'
  | 'phone'
  | 'billingName'
  | 'billingCountry'
  | 'billingZip'
  | 'billingCity'
  | 'billingAddress';

/**
 * Required fields, in the order the form presents them. `taxNumber` and the
 * country (which defaults) are intentionally not required.
 */
export const REQUIRED_BILLING_FIELDS: readonly BillingFieldKey[] = [
  'fullName',
  'email',
  'phone',
  'billingName',
  'billingZip',
  'billingCity',
  'billingAddress',
];

export interface BillingValidationResult {
  valid: boolean;
  /** Required fields that are empty/whitespace, in canonical order. */
  missingFields: BillingFieldKey[];
  /** True when the email is present but not a plausible address. */
  invalidEmail: boolean;
}

/** Deliberately permissive: something@something.tld with no spaces. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

function isBlank(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

/**
 * Validates a contact & billing input. The country is checked too but has a
 * default, so callers should fill it with `DEFAULT_BILLING_COUNTRY` before
 * validating (see `createEmptyBillingInput`).
 */
export function validateClientBillingProfile(
  input: ClientBillingProfileInput,
): BillingValidationResult {
  const missingFields = REQUIRED_BILLING_FIELDS.filter((field) => {
    const value = input[field];
    return typeof value !== 'string' || isBlank(value);
  });

  const invalidEmail = !isBlank(input.email) && !isValidEmail(input.email);

  return {
    valid: missingFields.length === 0 && !invalidEmail,
    missingFields,
    invalidEmail,
  };
}

/** A blank billing input (country prefilled) for a fresh client. */
export function createEmptyBillingInput(userId: string): ClientBillingProfileInput {
  return {
    userId,
    fullName: '',
    email: '',
    phone: '',
    billingName: '',
    billingCountry: DEFAULT_BILLING_COUNTRY,
    billingZip: '',
    billingCity: '',
    billingAddress: '',
  };
}

/**
 * Applies the "Számlázási név megegyezik a teljes névvel" toggle: when on, the
 * billing name mirrors the contact name.
 */
export function resolveBillingName(
  fullName: string,
  sameAsFullName: boolean,
  billingName: string,
): string {
  return sameAsFullName ? fullName : billingName;
}
