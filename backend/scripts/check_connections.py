"""Check configured providers without printing credentials or student data."""

import argparse
import json
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


def request(
    url: str, headers: dict[str, str], data: dict | None = None, timeout: int = 30
):
    payload = json.dumps(data).encode() if data is not None else None
    try:
        with urlopen(
            Request(url, data=payload, headers=headers), timeout=timeout
        ) as response:
            return response.status, json.load(response)
    except HTTPError as exc:
        try:
            return exc.code, json.load(exc)
        except (ValueError, OSError):
            return exc.code, {}
    except (URLError, TimeoutError, OSError):
        return 0, {}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--model")
    parser.add_argument("--auth-only", action="store_true")
    args = parser.parse_args()
    values = {}
    for line in (Path(__file__).resolve().parents[1] / ".env").read_text().splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip()
    url = values["SUPABASE_URL"].rstrip("/")
    public = {"apikey": values["SUPABASE_PUBLISHABLE_KEY"]}
    status, auth = request(url + "/auth/v1/settings", public)
    print("Supabase Auth:", status or "NETWORK_ERROR")
    if status == 200:
        providers = auth.get("external", {})
        print("Email login enabled:", bool(providers.get("email")))
        print("Google login enabled:", bool(providers.get("google")))
    if args.auth_only:
        return
    status, table = request(url + "/rest/v1/papers?select=id&limit=0", public)
    print("Supabase papers table:", status or "NETWORK_ERROR")
    if isinstance(table, dict) and table.get("code"):
        print("Supabase table error code:", table["code"])
    key = values.get("SUPABASE_SECRET_KEY") or values.get("SUPABASE_SERVICE_ROLE_KEY")
    if key:
        headers = {"apikey": key}
        if not key.startswith("sb_secret_"):
            headers["Authorization"] = "Bearer " + key
        status, _ = request(url + "/rest/v1/papers?select=id&limit=0", headers)
        print("Supabase server access:", status or "NETWORK_ERROR")
    else:
        print("Supabase server access: MISSING_SERVER_KEY")
    headers = {
        "x-goog-api-key": values["GEMINI_API_KEY"],
        "Content-Type": "application/json",
    }
    selected_model = args.model or values.get("GEMINI_MODEL", "gemini-2.5-flash")
    model = quote(selected_model, safe="")
    endpoint = "https://generativelanguage.googleapis.com/v1beta/models/" + model
    status, metadata = request(endpoint, headers)
    print("Gemini model access:", status or "NETWORK_ERROR")
    print("Gemini model methods:", metadata.get("supportedGenerationMethods", []))
    if status == 200:
        status, result = request(
            endpoint + ":generateContent",
            headers,
            {
                "contents": [{"parts": [{"text": "Reply with OK."}]}],
                "generationConfig": {
                    "maxOutputTokens": 256,
                    "thinkingConfig": (
                        {"thinkingLevel": "LOW"}
                        if selected_model.startswith("gemini-3")
                        else {"thinkingBudget": 0}
                    ),
                },
            },
            timeout=60,
        )
        print("Gemini generation:", status or "NETWORK_ERROR")
        print("Gemini returned a response:", bool(result.get("candidates")))
        if status != 200:
            reason = result.get("error", {}).get("message", "No error details")
            for secret in (values["GEMINI_API_KEY"], key):
                if secret:
                    reason = reason.replace(secret, "[redacted]")
            print("Gemini error:", reason[:500])
            status, models = request(
                "https://generativelanguage.googleapis.com/v1beta/models?pageSize=100",
                headers,
            )
            print(
                "Available Flash generation models:",
                [
                    m["name"]
                    for m in models.get("models", [])
                    if "flash" in m.get("name", "")
                    and "generateContent" in m.get("supportedGenerationMethods", [])
                ],
            )


if __name__ == "__main__":
    main()
