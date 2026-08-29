# Google Login Setup

PersonaChat uses Google's server-side OAuth 2.0 authorization-code flow. The server exchanges the code and then reads the authenticated profile from Google's OpenID Connect UserInfo endpoint. No Google access or refresh token is stored in the PersonaChat database.

## Environment

Set these server-only variables in `.env.local` (never prefix them with `NEXT_PUBLIC_`):

```env
GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
PERSONACHAT_PUBLIC_URL=https://your-domain.example
GOOGLE_REDIRECT_URI=https://your-domain.example/api/auth/google/callback
```

For local development you can use:

```env
PERSONACHAT_PUBLIC_URL=http://localhost:3000
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
```

The redirect URI configured in Google Cloud must exactly match the URI sent by PersonaChat. HTTPS is required for non-localhost production redirects.

## Google Cloud

1. Create or select the PersonaChat project.
2. Configure the OAuth consent screen.
3. Create an OAuth 2.0 Client ID with application type **Web application**.
4. Add the exact authorized redirect URI above.
5. Keep the client secret private.

## Account behavior

- Existing PersonaChat users are matched by the verified Google email and linked to the Google `sub` identifier.
- New Google users receive a normal PersonaChat account, session, app-data row, and generated username.
- Google-only accounts receive a random unusable password hash; the Google credential is not stored as a password.
- A Google account already linked to another PersonaChat account is rejected rather than silently reassigning the identity.
- The OAuth `state` value is stored in an HttpOnly, SameSite cookie and verified on callback to mitigate CSRF.
