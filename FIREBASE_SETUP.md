# Firebase Setup Guide for Kiaros

You have already created a Firebase project. Follow each step in order.

---

## Part 1 — Register the Android App

1. Open [Firebase Console](https://console.firebase.google.com) → your project
2. Click the **Android** icon (Add app)
3. Fill in the form:
   - **Android package name**: `com.kiaros.app`
   - **App nickname**: `Kiaros Android`
   - **Debug signing certificate SHA-1**: leave blank for now
4. Click **Register app**
5. Click **Download google-services.json**
6. Place the file at:
   ```
   client-mobile/google-services.json
   ```
7. Click **Next → Next → Continue to console** (skip the SDK steps)

---

## Part 2 — Register the iOS App

1. In the same Firebase project, click **Add app** → iOS icon
2. Fill in the form:
   - **Apple bundle ID**: `com.kiaros.app`
   - **App nickname**: `Kiaros iOS`
3. Click **Register app**
4. Click **Download GoogleService-Info.plist**
5. Place the file at:
   ```
   client-mobile/GoogleService-Info.plist
   ```
6. Click **Next → Next → Continue to console** (skip the SDK steps)

---

## Part 3 — Update app.json

Open `client-mobile/app.json` and update the `android` and `ios` sections to reference both files:

```json
{
  "expo": {
    "name": "Kiaros",
    "slug": "kiaros",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "scheme": "kiaros",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#030712"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.kiaros.app",
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#030712"
      },
      "package": "com.kiaros.app",
      "googleServicesFile": "./google-services.json"
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#030712"
        }
      ]
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

---

## Part 4 — Keep config files out of git

Run this once from the repo root:

```bash
echo "client-mobile/google-services.json" >> .gitignore
echo "client-mobile/GoogleService-Info.plist" >> .gitignore
```

---

## Part 5 — Enable Cloud Messaging

1. Firebase Console → your project → **Build** → **Cloud Messaging**
2. Confirm **Firebase Cloud Messaging API (V1)** shows as **Enabled**
   - If it shows disabled, click **Enable**
3. Copy the **Sender ID** shown on the page — keep it handy

### iOS APNs key (required for iOS push)

1. Go to [Apple Developer Console](https://developer.apple.com) → **Certificates, IDs & Profiles** → **Keys**
2. Click **+** → name it `Kiaros FCM`, enable **Apple Push Notifications service (APNs)**
3. Download the `.p8` file — you can only download it once
4. Back in Firebase Console → **Cloud Messaging** → **Apple app configuration**
5. Upload the `.p8` file, enter your **Key ID** and **Team ID** (found in Apple Developer account)

---

## Part 6 — Install EAS CLI and link the project

```bash
npm install -g eas-cli
cd client-mobile
eas login          # sign in with your Expo account (create one free at expo.dev if needed)
eas build:configure
```

`eas build:configure` will:
- Create `client-mobile/eas.json`
- Inject your EAS `projectId` into `app.json` under `extra.eas.projectId`
- This `projectId` is what `getExpoPushTokenAsync()` reads at runtime

After running it, your `app.json` will gain:
```json
"extra": {
  "eas": {
    "projectId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
  }
}
```

---

## Part 7 — Install dependencies

```bash
cd client-mobile
npx expo install expo-notifications expo-constants expo-file-system expo-document-picker
```

---

## Part 8 — Build for Android (internal testing)

```bash
eas build --platform android --profile preview
```

- Build takes ~15–20 minutes in the EAS cloud
- When done, EAS prints a download link for the `.apk`
- Download it

---

## Part 9 — Upload to Play Console

1. Open [Google Play Console](https://play.google.com/console) → **Create app**
2. Fill in name (`Kiaros`), language, app/game, free/paid
3. Complete the **Setup** checklist in the left sidebar (takes ~10 min):
   - App access, ads, content rating, target audience, data safety
4. Go to **Testing → Internal testing → Create new release**
5. Upload the `.apk` from Step 8
6. Add release notes → **Save → Review release → Start rollout**
7. Go to **Testers** tab → add tester email addresses
8. Testers receive an opt-in link; after accepting they install via Play Store

---

## Part 10 — Build for iOS (TestFlight)

> Requires a paid Apple Developer account ($99/year).

```bash
eas build --platform ios
```

EAS will guide you through:
- Creating or selecting a provisioning profile
- Creating or selecting a signing certificate
- This is mostly automatic — answer the prompts

When the build finishes:

```bash
eas submit --platform ios
```

EAS uploads directly to App Store Connect. Then:
1. Open [App Store Connect](https://appstoreconnect.apple.com) → your app → **TestFlight**
2. The build will appear after processing (~10–30 min)
3. Add internal testers under **Internal Testing**
4. For external testers, create an **External Group** and submit for Beta App Review

---

## Part 11 — Verify push notifications end-to-end

Once a build is installed on a real device:

1. Open the app → grant notification permission when prompted
2. The app registers a push token and POSTs it to your server (`/api/push/register`)
3. On your server, check the `push_tokens` table has a row for the device
4. Trigger a scheduler job to complete — the server will send a push via Expo's push API
5. The notification should appear on the device

To test manually from your server machine:

```bash
curl -X POST https://exp.host/--/api/v2/push/send \
  -H "Content-Type: application/json" \
  -d '{
    "to": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
    "title": "Kiaros",
    "body": "Test notification"
  }'
```

Replace the token with the value from your `push_tokens` table.

---

## Part 12 — Production releases (when ready)

```bash
# Build both platforms for production
eas build --platform all --profile production

# Submit both
eas submit --platform android
eas submit --platform ios
```

Before production submission:
- Replace placeholder PNG assets in `client-mobile/assets/` with real Kiaros branding
- Set `"version"` in `app.json` appropriately
- Fill out full store listings in Play Console and App Store Connect

---

## Quick reference — file locations

| File | Path |
|------|------|
| Android Firebase config | `client-mobile/google-services.json` |
| iOS Firebase config | `client-mobile/GoogleService-Info.plist` |
| EAS build config | `client-mobile/eas.json` |
| App config | `client-mobile/app.json` |
| Assets | `client-mobile/assets/` |
| Push registration (mobile) | `client-mobile/app/_layout.tsx` |
| Push dispatch (server) | `server/scheduler/runner.js` |
| Push token storage (server) | `server/routes/push.js` |
