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
EXPO_PUBLIC_API_URL=http://localhost:8000
OPENAI_API_KEY=sk-...
OPENAI_MODEL_DEPLOYMENT=gpt-4o
# Optional: SNAPSELL_ALLOWED_ORIGINS=http://localhost:8081,http://localhost:5173
```

**Important for mobile devices:** If you're testing on a physical device or emulator, you need to set `EXPO_PUBLIC_API_URL` to your computer's local IP address instead of `localhost`.

To find your IP address:
- **macOS/Linux:** Run `ifconfig | grep "inet " | grep -v 127.0.0.1`
- **Windows:** Run `ipconfig` and look for IPv4 Address

Then update your `.env`:
```
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000  # Replace with your actual IP
```

These values are loaded both by the Expo app (for the API base URL) and the FastAPI backend via `python-dotenv`.
