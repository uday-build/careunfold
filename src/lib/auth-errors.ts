const messages: Record<string, string> = {
  access_denied: "Google sign-in was canceled. No account was created and no session was started.",
  account_not_linked:
    "This email already has a CareUnfold password account. Sign in with your password, then link Google from Settings.",
  email_not_verified: "Google did not confirm this email address, so no account was created.",
  unable_to_create_user: "The account could not be created. Nothing was saved. Try again.",
  unable_to_get_user_info: "Google did not return your profile. No account was created. Try again.",
  invalid_code: "The Google sign-in expired or was already used. Start again.",
  state_not_found: "The Google sign-in expired. Start again from this page.",
  oauth_provider_not_found: "Google sign-in is not configured on this server.",
  INVALID_TOKEN: "That link cannot be used. Request a new one.",
};

export function authErrorMessage(code: string | undefined, fallback: string): string | undefined {
  if (!code) return undefined;
  return messages[code] ?? fallback;
}
