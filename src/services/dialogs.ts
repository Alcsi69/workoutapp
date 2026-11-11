// Cross-platform dialogs.
//
// `Alert.alert` is a no-op in react-native-web (it silently does nothing), which
// would leave every confirmation-gated action — cancelling a booking, finishing
// or discarding a workout, restoring a backup — dead on the web build. This
// module maps the same intent onto the browser's native dialogs instead.

import { Alert, Platform } from 'react-native';

/** Minimal view of the browser globals we need (no DOM lib dependency). */
interface BrowserDialogs {
  alert?: (message?: string) => void;
  confirm?: (message?: string) => boolean;
}

function browser(): BrowserDialogs {
  return globalThis as unknown as BrowserDialogs;
}

/** Joins a title and body into the single string the browser dialogs show. */
function composeMessage(title: string, message?: string): string {
  return message !== undefined && message.length > 0 ? `${title}\n\n${message}` : title;
}

/** Fire-and-forget information dialog. */
export function notify(title: string, message?: string): void {
  if (Platform.OS === 'web') {
    browser().alert?.(composeMessage(title, message));
    return;
  }
  Alert.alert(title, message);
}

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Label of the action button (e.g. "Törlés"). */
  confirmLabel: string;
  /** Label of the dismiss button. */
  cancelLabel: string;
  /** Renders the confirm button in the danger style on native. */
  destructive?: boolean;
  onConfirm: () => void;
}

/** Confirmation dialog; `onConfirm` runs only when the user accepts. */
export function confirm(options: ConfirmOptions): void {
  const { title, message, confirmLabel, cancelLabel, destructive = false, onConfirm } = options;

  if (Platform.OS === 'web') {
    if (browser().confirm?.(composeMessage(title, message)) === true) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
}
