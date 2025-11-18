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

## Deploying the Backend

You can deploy the backend to a cloud service so you don't need to run it locally. This makes mobile testing much easier!

### Option 1: Railway (Recommended - Easiest)

1. **Sign up at [railway.app](https://railway.app)** (free tier available)

2. **Create a new project:**
   - Click "New Project"
   - Select "Deploy from GitHub repo" (or use Railway CLI)
   - Connect your repository

3. **Configure environment variables:**
   In Railway's dashboard, add these environment variables:
   ```
   OPENAI_API_KEY=sk-...
   OPENAI_MODEL_DEPLOYMENT=gpt-4o
   # Or use Azure:
   AZURE_OPENAI_API_KEY=...
   AZURE_OPENAI_ENDPOINT=...
   AZURE_OPENAI_MODEL_DEPLOYMENT=gpt-4o
   AZURE_OPENAI_API_VERSION=2024-08-01-preview
   ```

4. **Deploy:**
   - Railway will automatically detect the Dockerfile and deploy
   - Once deployed, Railway will give you a URL like `https://your-app.railway.app`

5. **Update your `.env` file:**
   ```
   EXPO_PUBLIC_API_URL=https://your-app.railway.app
   ```

### Option 2: Render

1. **Sign up at [render.com](https://render.com)** (free tier available)

2. **Create a new Web Service:**
   - Connect your GitHub repository
   - Select "Docker" as the environment
   - Use the root directory

3. **Configure environment variables** (same as Railway above)

4. **Deploy:**
   - Render will build and deploy automatically
   - You'll get a URL like `https://your-app.onrender.com`

5. **Update your `.env` file:**
   ```
   EXPO_PUBLIC_API_URL=https://your-app.onrender.com
   ```

### Option 3: Fly.io

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Login and launch:**
   ```bash
   fly auth login
   fly launch
   ```

3. **Set environment variables:**
   ```bash
   fly secrets set OPENAI_API_KEY=sk-...
   fly secrets set OPENAI_MODEL_DEPLOYMENT=gpt-4o
   ```

4. **Deploy:**
   ```bash
   fly deploy
   ```

5. **Get your URL:**
   ```bash
   fly info
   ```

### After Deployment

Once your backend is deployed, update your `.env` file with the deployed URL:
```
EXPO_PUBLIC_API_URL=https://your-deployed-backend-url.com
```

Then restart your Expo app:
```bash
npx expo start
```

Your mobile app will now connect to the hosted backend instead of localhost!

## Workflow

1. Open the app and tap **Snap / Upload Item**
2. Choose a single photo; SnapSell uploads it to `/api/analyze-image`
3. The backend calls the configured LLM vision model and returns structured data
4. Tweak the listing on the preview screen and press **Copy listing text**
5. Tap **Add next item** to repeat the flow
