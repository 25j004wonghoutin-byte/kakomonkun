export const NEW_GOOGLE_ACCOUNT_DOMAIN = "edu.kimura.ac.jp";
export const GOOGLE_DOMAIN_ERROR_CODE = "google_domain_not_allowed";

export class GoogleAccountDomainError extends Error {
  readonly code = GOOGLE_DOMAIN_ERROR_CODE;

  constructor() {
    super("新規のGoogleログインは @edu.kimura.ac.jp のアカウントをご利用ください。既存のアカウントは引き続きログインできます。");
    this.name = "GoogleAccountDomainError";
  }
}

export function assertNewGoogleAccountEmailAllowed(email: string) {
  if (!/^[^@\s]+@edu\.kimura\.ac\.jp$/i.test(email)) {
    throw new GoogleAccountDomainError();
  }
}
