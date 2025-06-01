declare module 'dropbox' {
  export class Dropbox {
    constructor(options: { clientId: string; clientSecret: string });
    getAuthenticationUrl(redirectUri: string, state: string | null, authType: string): Promise<string>;
    getAccessTokenFromCode(redirectUri: string, code: string): Promise<{ result: { access_token: string; refresh_token: string; expires_in: number } }>;
    checkUser(options: { accessToken: string }): Promise<{ result: { allocation: { allocated: number } } }>;
  }
} 