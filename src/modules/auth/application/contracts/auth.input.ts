export interface LoginInput {
  /** Já normalizado (trim + minúsculas) pela borda. */
  email: string;
  password: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
