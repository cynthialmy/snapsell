# OAuth Setup Guide for Supabase

This guide explains how to configure Google and Apple OAuth providers in your Supabase project to enable social sign-in/sign-up in the SnapSell app.

## Prerequisites

- A Supabase project (create one at [supabase.com](https://supabase.com))
- A Google Cloud Console account (for Google OAuth)
- An Apple Developer account (for Apple OAuth)

## 1. Configure Google OAuth Provider

### Step 1: Create OAuth Credentials in Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select or create a project
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure the OAuth consent screen:
   - Choose **External** user type (unless you have a Google Workspace)
   - Fill in required fields (App name, User support email, Developer contact)
   - Add scopes: `email`, `profile`, `openid`
   - Add test users if needed (for development)
6. Create OAuth 2.0 Client ID:
   - **Application type**: Web application
   - **Name**: SnapSell (or your preferred name)
   - **Authorized redirect URIs**:
     ```
     https://[your-project-ref].supabase.co/auth/v1/callback
     ```
     Replace `[your-project-ref]` with your Supabase project reference (found in your Supabase project URL)
7. Click **Create**
8. Copy the **Client ID** and **Client Secret**

### Step 2: Configure Google Provider in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Providers**
3. Find **Google** in the list
4. Toggle **Enable Google provider** to ON
5. Enter the credentials:
   - **Client ID (for OAuth)**: Paste your Google OAuth Client ID
   - **Client Secret (for OAuth)**: Paste your Google OAuth Client Secret
6. Click **Save**

### Step 3: Verify Redirect URL

The redirect URL `https://[your-project-ref].supabase.co/auth/v1/callback` should already be configured in Supabase. Verify it's present in:
- **Authentication** → **URL Configuration** → **Redirect URLs**

## 2. Configure Apple OAuth Provider

### Step 1: Create App ID in Apple Developer Portal

**Note:** You need to create an App ID first before creating the Services ID. The App ID should match your app's bundle identifier.

1. Go to [Apple Developer Portal](https://developer.apple.com/account/)
2. Navigate to **Certificates, Identifiers & Profiles**
3. Click **Identifiers** → **+** (plus button)
4. Select **App IDs** → **Continue**
5. Select **App** → **Continue**
6. Register a new App ID:
   - **Description**: SnapSell (or your preferred name)
   - **Bundle ID**:
     - Select **Explicit**
     - Enter: `com.cynthiamengyuanli.snapsell` (or match your app's bundle identifier from `app.json`)
   - Under **Capabilities**, check **Sign in with Apple**
7. Click **Continue** → **Register**
8. Note your **App ID** (should be `com.cynthiamengyuanli.snapsell`)

### Step 2: Create Service ID in Apple Developer Portal

1. In Apple Developer Portal, go to **Certificates, Identifiers & Profiles**
2. Click **Identifiers** → **+** (plus button)
3. Select **Services IDs** → **Continue**
4. Register a new Services ID:
   - **Description**: SnapSell Authentication (or your preferred name)
   - **Identifier**: `com.cynthiamengyuanli.snapsell.auth` (must be unique, reverse domain notation)
     - **Note:** This is different from your App ID - it's specifically for web authentication
5. Click **Continue** → **Register**
6. Edit the Services ID you just created
7. Check **Sign in with Apple** → **Configure**
8. Configure Sign in with Apple:
   - **Primary App ID**: Select the App ID you created in Step 1 (e.g., `com.cynthiamengyuanli.snapsell`)
   - **Website URLs**:
     - **Domains**: `[your-project-ref].supabase.co`
       - Replace `[your-project-ref]` with your Supabase project reference (found in your Supabase project URL)
     - **Return URLs**: `https://[your-project-ref].supabase.co/auth/v1/callback`
       - Replace `[your-project-ref]` with your Supabase project reference
   - Click **Save** → **Continue** → **Save**
9. Note your **Services ID** (e.g., `com.cynthiamengyuanli.snapsell.auth`)

### Step 3: Create Apple Secret Key and Generate JWT

1. In Apple Developer Portal, go to **Certificates, Identifiers & Profiles**
2. Click **Keys** → **+** (plus button)
3. Create a new key:
   - **Key Name**: SnapSell Sign in with Apple (or your preferred name)
   - Check **Sign in with Apple**
   - Click **Configure** → Select your Primary App ID (the App ID from Step 1) → **Save**
   - Click **Continue** → **Register**
4. **Download the key file** (`.p8` file) - you can only download it once! Save it securely.
5. Note your **Key ID** (shown after creation, e.g., `ABC123DEF4`)
6. Note your **Team ID** (found at the top right of the Apple Developer Portal, e.g., `XYZ987ABC6`)

### Step 4: Generate JWT Client Secret

Supabase requires a JWT token as the secret key, not the raw `.p8` file. You need to generate a JWT using your credentials.

**Option A: Using Online Tool (Easiest)**

1. Go to [Apple Client Secret Generator](https://applekeygen.expo.app/)
2. Enter the following:
   - **Key ID**: Your Key ID from Step 3
   - **Team ID**: Your Team ID from Step 3
   - **Client ID**: Your Services ID from Step 2 (e.g., `com.cynthiamengyuanli.snapsell.auth`)
   - **Private Key**: Open your downloaded `.p8` file and paste its entire contents
   - **Expiration**: Set to 6 months (180 days) or your preferred duration
3. Click **Generate JWT**
4. Copy the generated JWT token - you'll need this for Supabase

**Option B: Using Python Script**

1. Install required library:
   ```bash
   pip install pyjwt cryptography
   ```
2. Create a script `generate_apple_jwt.py`:
   ```python
   import jwt
   import datetime

   # Replace these with your actual values
   TEAM_ID = 'your_team_id'  # From Step 3
   CLIENT_ID = 'com.cynthiamengyuanli.snapsell.auth'  # Your Services ID from Step 2
   KEY_ID = 'your_key_id'  # From Step 3

   # Path to your downloaded .p8 file
   with open("AuthKey_xxxxx.p8", "r") as f:
       private_key = f.read()

   headers = {
       "kid": KEY_ID,
       "alg": "ES256"
   }

   payload = {
       "iss": TEAM_ID,
       "iat": int(datetime.datetime.now().timestamp()),
       "exp": int((datetime.datetime.now() + datetime.timedelta(days=180)).timestamp()),
       "aud": "https://appleid.apple.com",
       "sub": CLIENT_ID
   }

   token = jwt.encode(payload, private_key, algorithm="ES256", headers=headers)
   print(token)
   ```
3. Run the script:
   ```bash
   python generate_apple_jwt.py
   ```
4. Copy the generated JWT token

**Important:** The JWT expires after the duration you set (typically 6 months). You'll need to regenerate it before it expires to keep Apple OAuth working.

### Step 5: Configure Apple Provider in Supabase

1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Providers**
3. Find **Apple** in the list
4. Toggle **Enable Apple provider** to ON
5. Enter the credentials:
   - **Services ID** (or **Client ID**): Your Apple Services ID (e.g., `com.cynthiamengyuanli.snapsell.auth`)
   - **Secret Key**: Paste the JWT token you generated in Step 4 (not the `.p8` file contents)
6. Click **Save**

**Note:** Supabase only requires the Services ID and JWT secret key. Team ID and Key ID are used to generate the JWT but are not entered directly into Supabase.

## 3. Configure Redirect URLs

### Add Deep Link Redirect URL

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**
2. Under **Redirect URLs**, add:
   ```
   snapsell://auth/callback
   ```
   This is the deep link URL that your app uses to receive OAuth callbacks.
3. Click **Save**

### Verify Redirect URLs

Your **Redirect URLs** should include:
- `https://[your-project-ref].supabase.co/auth/v1/callback` (already configured by Supabase)
- `snapsell://auth/callback` (the deep link for your app)

**Note:** The **Site URL** can remain as configured (it's used for email templates, not OAuth).

## 4. Testing OAuth

### Test Google OAuth

1. Open your app
2. Navigate to sign-in or sign-up screen
3. Tap "Continue with Google"
4. You should see Google's OAuth consent screen
5. After authentication, you should be redirected back to the app and signed in

### Test Apple OAuth

**On iOS:**
1. Open your app on an iOS device
2. Navigate to sign-in or sign-up screen
3. Tap "Continue with Apple"
4. You should see the native Sign in with Apple sheet
5. After authentication, you should be signed in

**On Android:**
1. Open your app on an Android device
2. Navigate to sign-in or sign-up screen
3. Tap "Continue with Apple"
4. You should see Apple's web-based OAuth screen
5. After authentication, you should be redirected back to the app and signed in

## Troubleshooting

### Google OAuth Issues

**Error: "redirect_uri_mismatch"**
- Verify the redirect URI in Google Cloud Console exactly matches: `https://[your-project-ref].supabase.co/auth/v1/callback`
- Make sure there are no trailing slashes or extra characters

**Error: "invalid_client"**
- Verify your Client ID and Client Secret are correct in Supabase
- Make sure you copied the credentials from the correct OAuth client (Web application type)

**OAuth consent screen not showing**
- Check that your OAuth consent screen is published (for production) or add test users (for development)
- Verify the app is not in "Testing" mode with restricted users

### Apple OAuth Issues

**Error: "invalid_client" or "invalid_grant"**
- Verify your Services ID is correct in Supabase
- Make sure the Secret Key is a valid JWT token (not the `.p8` file contents)
- Verify the JWT was generated correctly with the right Team ID, Key ID, and Services ID
- Check that the JWT hasn't expired (regenerate if needed)
- Ensure the `.p8` file used to generate the JWT is the correct one from Apple Developer Portal

**Error: "redirect_uri_mismatch"**
- Verify the Return URL in Apple Developer Portal exactly matches: `https://[your-project-ref].supabase.co/auth/v1/callback`
- Check that the domain in Apple Developer Portal matches your Supabase project domain

**Sign in with Apple not showing on iOS**
- Verify `expo-apple-authentication` plugin is configured in `app.json`
- Make sure you're testing on a physical iOS device (Sign in with Apple doesn't work in iOS Simulator)
- Check that your app's Bundle Identifier matches the Primary App ID configured in Apple Developer Portal

**Native Apple Sign In not working / Error -7026 or Code 1000**
- **Most common cause:** Testing on iOS Simulator. Sign in with Apple **only works on physical iOS devices**, not in the iOS Simulator. Test on a real device.
- Verify the App ID in Apple Developer Portal has "Sign in with Apple" capability enabled:
  1. Go to Apple Developer Portal → Certificates, Identifiers & Profiles → Identifiers
  2. Find your App ID (`com.cynthiamengyuanli.snapsell`)
  3. Make sure "Sign in with Apple" is checked under Capabilities
- Ensure your app's Bundle Identifier in `app.json` exactly matches the App ID in Apple Developer Portal
- Rebuild the app after configuring Sign in with Apple in Apple Developer Portal:
  ```bash
  npx expo prebuild --clean
  npx expo run:ios --device
  ```
- Check that you're signed in with an Apple ID that has access to the Apple Developer account
- Verify the app is properly signed with a provisioning profile that includes Sign in with Apple
- If using EAS Build, make sure your provisioning profile includes the Sign in with Apple entitlement

### General OAuth Issues

**Deep link not opening app**
- Verify `snapsell://auth/callback` is in Supabase Redirect URLs
- Check that your app's deep link scheme matches (should be `snapsell` as configured in `app.json`)
- On Android, you may need to rebuild the app for deep links to work

**Session not created after OAuth**
- Check that the deep link handler in `app/_layout.tsx` is processing the callback correctly
- Verify tokens are present in the callback URL hash fragment
- Check Supabase logs for any authentication errors

**User not redirected after OAuth**
- The deep link handler should automatically navigate users after successful authentication
- Check that `AuthContext` is properly updating when the session is created
- Verify navigation logic in `app/_layout.tsx` handles OAuth callbacks

## Additional Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth Setup](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Apple OAuth Setup](https://supabase.com/docs/guides/auth/social-login/auth-apple)
- [Expo Apple Authentication](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Expo Web Browser](https://docs.expo.dev/versions/latest/sdk/webbrowser/)

## Security Notes

- Never commit OAuth credentials (Client IDs, Client Secrets, JWT tokens, Apple Keys) to version control
- Store sensitive credentials in environment variables or secure secret management
- Regularly rotate OAuth credentials for security
- **Important:** Apple JWT secrets expire (typically after 6 months). Set a reminder to regenerate the JWT before it expires to avoid authentication failures
- Use HTTPS for all OAuth redirect URLs (Supabase provides this automatically)
- Keep your Apple Secret Key (`.p8` file) secure - you can only download it once
- The JWT token contains your Team ID and Key ID, so treat it as sensitive information
