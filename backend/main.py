from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from tools import llm_api


class ListingData(BaseModel):
  title: str
  price: str
  description: str
  condition: str
  location: str
  brand: str = ""
  pickupAvailable: bool = False
  shippingAvailable: bool = False
  pickupNotes: str = ""


app = FastAPI(
  title="SnapSell Vision API",
  description="Convert a single photo of an item into a resale listing block.",
  version="0.1.0",
)


def _allowed_origins() -> list[str]:
  raw = os.getenv("SNAPSELL_ALLOWED_ORIGINS", "*")
  if raw == "*":
    return ["*"]
  return [origin.strip() for origin in raw.split(",") if origin.strip()]


app.add_middleware(
  CORSMiddleware,
  allow_origins=_allowed_origins(),
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

PROMPT_TEMPLATE = """You are SnapSell, an assistant that helps people list second-hand items.
Analyze the attached product photo and return ONLY valid JSON (no markdown, no code blocks, no explanations) matching this exact schema:
{{
  "title": string,          // short, searchable product headline
  "price": string,          // numeric price, no currency symbol
  "description": string,    // 2-3 concise sentences with key selling points
  "condition": string,      // one of: "New", "Used - Like New", "Used - Good", "Used - Fair", "Refurbished"
  "location": string        // city or neighborhood if inferable, otherwise empty string
}}

Rules:
- Return ONLY the JSON object, nothing else. No markdown code blocks, no explanations, no text before or after.
- Estimate price based on the item's condition, brand, age, and market value. Use realistic pricing (e.g., a used chair might be 45-150, a new phone might be 500-1200). If you cannot reasonably estimate the price, return an empty string. Do NOT use placeholder values like 120.
- Keep description under 400 characters.
- Prefer realistic consumer-friendly language.
- If you cannot infer a field, return an empty string for that field.
"""


def _to_bool(value: Any) -> bool:
  if isinstance(value, bool):
    return value
  if isinstance(value, (int, float)):
    return bool(value)
  if isinstance(value, str):
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
      return True
    if normalized in {"0", "false", "no", "n"}:
      return False
  return False


def _normalize_listing(payload: Dict[str, Any]) -> ListingData:
  fallback = {
    "title": payload.get("title") or "",
    "price": str(payload.get("price") or ""),
    "description": payload.get("description") or "",
    "condition": payload.get("condition") or "",
    "location": payload.get("location") or "",
    "brand": payload.get("brand") or "",
    "pickupAvailable": _to_bool(payload.get("pickupAvailable")),
    "shippingAvailable": _to_bool(payload.get("shippingAvailable")),
    "pickupNotes": payload.get("pickupNotes") or "",
  }
  return ListingData(**fallback)


@app.post("/api/analyze-image", response_model=ListingData)
async def analyze_image(
  image: UploadFile = File(...),
  provider: str = Form("azure"),
  model: Optional[str] = Form(None),
):
  if not image.content_type or not image.content_type.startswith("image/"):
    raise HTTPException(status_code=400, detail="Please upload an image file.")

  contents = await image.read()
  suffix = Path(image.filename or "photo.jpg").suffix or ".jpg"

  with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
    temp_file.write(contents)
    temp_path = temp_file.name

  try:
    response = llm_api.query_llm(
      prompt=PROMPT_TEMPLATE,
      provider=provider,
      model=model,
      image_path=temp_path,
    )
  except Exception as e:
    error_message = str(e)
    # Provide user-friendly error messages for common issues
    if "quota" in error_message.lower() or "insufficient_quota" in error_message.lower():
      detail = f"API quota exceeded. Please check your {provider} account billing and usage limits. Error: {error_message}"
    elif "api_key" in error_message.lower() or "authentication" in error_message.lower():
      detail = f"API authentication failed. Please check your {provider} API key in .env. Error: {error_message}"
    else:
      detail = f"Vision model error: {error_message}"
    raise HTTPException(status_code=502, detail=detail)
  finally:
    if os.path.exists(temp_path):
      os.unlink(temp_path)

  if not response:
    raise HTTPException(status_code=502, detail="Vision model failed to return a response.")

  # Extract JSON from markdown code blocks if present
  json_text = response.strip()
  # Remove markdown code blocks (```json ... ``` or ``` ... ```)
  if json_text.startswith('```'):
    lines = json_text.split('\n')
    # Remove first line (```json or ```)
    lines = lines[1:]
    # Remove last line if it's ```
    if lines and lines[-1].strip() == '```':
      lines = lines[:-1]
    json_text = '\n'.join(lines)

  # Try to find JSON object in the response if it's embedded in text
  json_text = json_text.strip()
  # Look for JSON object boundaries
  start_idx = json_text.find('{')
  end_idx = json_text.rfind('}')
  if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
    json_text = json_text[start_idx:end_idx + 1]

  try:
    parsed: Dict[str, Any] = json.loads(json_text)
  except json.JSONDecodeError as exc:
    raise HTTPException(
      status_code=500, detail=f"Failed to parse model output as JSON. Raw response: {response[:500]}"
    ) from exc

  listing = _normalize_listing(parsed)
  return listing


@app.get("/health")
async def health_check():
  return {"status": "ok"}
