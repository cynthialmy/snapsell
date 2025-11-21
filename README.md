# SnapSell

SnapSell is a mobile-first web app that turns a single photo of an item into a ready-to-paste resale listing block.

## Project structure

- `app/` – Expo Router screens (upload flow + listing preview)
- `backend/` – FastAPI server that sends item photos to the LLM vision endpoint defined in `tools/llm_api.py`
- `utils/` – shared API + text-formatting helpers

## Frontend quick start

```bash
npm install
npx expo start
```

The app is designed for phones first, but also works on the Expo web target.

## Backend quick start

1. **Activate the virtual environment and install dependencies:**
```bash
source ./venv/bin/activate
pip install -r backend/requirements.txt
```

2. **Start the backend server:**
```bash
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

The `--host 0.0.0.0` flag allows the server to accept connections from other devices on your network (needed for mobile testing).

The backend relies on the existing `tools/llm_api.py` helper to talk to GPT-4o (or any provider you configure).

## Environment variables

Create a `.env` file (not committed) at the project root with the following variables:

```
# Frontend (optional – see notes below)
EXPO_PUBLIC_API_URL=http://localhost:8000
EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST=false

# Backend / LLM keys
OPENAI_API_KEY=sk-...
OPENAI_MODEL_DEPLOYMENT=gpt-4o
# Optional: SNAPSELL_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:5173

# PostHog Analytics (optional)
EXPO_PUBLIC_POSTHOG_API_KEY=your_posthog_api_key_here
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
POSTHOG_API_KEY=your_posthog_api_key_here
POSTHOG_HOST=https://us.i.posthog.com
```

**Important for mobile devices:** The app now defaults to the hosted backend (`https://snapsell-backend.onrender.com`) whenever it detects it's running on a physical device and `EXPO_PUBLIC_API_URL` is unset or points to `localhost`. This guarantees that Expo Go / TestFlight builds can reach an accessible server out of the box.

If you still want to hit your local machine from a device (e.g., via a LAN IP or tunnel), set:

```
EXPO_PUBLIC_API_URL=https://<your-tunnel-or-ip>:8000
EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST=true
```

Setting `EXPO_PUBLIC_ALLOW_DEVICE_LOCALHOST=true` opts you back into whatever URL you configured, even if it contains `localhost`. Without that flag, physical devices automatically fall back to the hosted backend.

These values are loaded both by the Expo app (for the API base URL) and the FastAPI backend via `python-dotenv`.

**PostHog Analytics:** The app includes PostHog analytics to track user engagement and activation events. Configure PostHog credentials in your `.env` file. If not configured, analytics will be disabled. Events tracked include photo uploads, listing generation, copy actions, and API usage.

**For EAS Production Builds:** When building with EAS (Expo Application Services), you must configure PostHog environment variables as EAS secrets. Set them using:

```bash
eas secret:create --scope project --name EXPO_PUBLIC_POSTHOG_API_KEY --value your_posthog_api_key_here
eas secret:create --scope project --name EXPO_PUBLIC_POSTHOG_HOST --value https://us.i.posthog.com
```

Alternatively, you can set them in the EAS dashboard under your project's secrets. These variables are automatically included in production builds. The PostHog SDK is configured with `flushAt: 1` and `flushInterval: 10000ms` to ensure events are sent immediately on production builds.

**Debug Mode:** To enable verbose PostHog logging, set `EXPO_PUBLIC_POSTHOG_DEBUG=true` in your environment variables (useful for troubleshooting).

## Running on Physical iOS Device

When running on a physical iPhone device using `npx expo run:ios --device`, you may encounter an issue where the app installs but shows "no development servers" when opened. This happens when the device cannot connect to the Metro bundler.

### Solution 1: Use Tunnel Mode (Recommended)

Tunnel mode works even if your devices aren't on the same network:

1. **Stop any running Metro processes** (Ctrl+C in terminals running Metro)

2. In one terminal, start Metro with tunnel mode and clear cache:
```bash
npx expo start --tunnel --clear
```

3. Wait for Metro to fully start and show the tunnel URL (e.g., `exp://xxx-xxx.xxx.ngrok-free.app`)

4. In another terminal, rebuild and install the app:
```bash
npx expo run:ios --device
```

**Important:** If you still get connection errors, try uninstalling the app from your device first, then rebuild. The development client may have cached an old URL.

**For Simulator:** You don't need tunnel mode. Use regular Metro:
```bash
npx expo start --clear
npx expo run:ios
```

### Solution 2: Ensure Same Network Connection

If you prefer using LAN mode (faster, but requires same network):

1. **Verify both devices are on the same WiFi network** - Your Mac and iPhone must be connected to the same WiFi network.

2. **Check Mac firewall settings** - macOS Firewall may be blocking port 8081:
   - Go to System Settings → Network → Firewall
   - Temporarily disable firewall or add an exception for Node/Metro

3. **Start Metro with LAN mode explicitly**:
```bash
npx expo start --lan
```

4. Then build and install:
```bash
npx expo run:ios --device
```

### Solution 3: Manual Connection

If the automatic connection fails, you can manually enter the Metro URL in the Expo development client:

1. Start Metro: `npx expo start`
2. Note the URL shown (e.g., `http://192.168.1.90:8081`)
3. In the Expo dev client on your phone, tap "Enter URL manually" and enter the Metro URL

**Note:** The `app.json` and `eas.json` configurations are correct and don't need changes for device connectivity. The issue is purely network-related between your device and the Metro bundler.
