"""Prepare source and private hosting settings without logging credentials."""

import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "deployment"
EXCLUDED = {
    "node_modules", ".next", ".deps", ".venv", ".git", ".vercel",
    "__pycache__", ".pytest_cache", ".ruff_cache", ".npm-cache",
    "deployment", "sample-papers",
}


def read_env(path: Path) -> dict[str, str]:
    values = {}
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")
    return values


def main() -> None:
    OUT.mkdir(exist_ok=True)
    backend = read_env(ROOT / "backend/.env")
    frontend = read_env(ROOT / "frontend/.env.local")
    keys = ("SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY", "GEMINI_MODEL")
    private = {key: backend[key] for key in keys if backend.get(key)}
    if not private.get("SUPABASE_URL") or not private.get("GEMINI_API_KEY"):
        raise ValueError("Backend service configuration is incomplete")
    if not (private.get("SUPABASE_SECRET_KEY") or private.get("SUPABASE_SERVICE_ROLE_KEY")):
        raise ValueError("A Supabase server key is required")
    private["ENABLE_WORKER"] = "true"
    # FRONTEND_ORIGIN must be added once the production Vercel URL is known.
    (OUT / "render-private.env").write_text("".join(f"{k}={v}\n" for k, v in private.items()), encoding="utf-8")
    public = {key: value for key, value in frontend.items() if key in {"NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY"}}
    (OUT / "vercel-public.env").write_text("".join(f"{k}={v}\n" for k, v in public.items()), encoding="utf-8")
    with zipfile.ZipFile(OUT / "autocheck-source.zip", "w", zipfile.ZIP_DEFLATED) as archive:
        for folder, directories, names in os.walk(ROOT):
            directories[:] = [name for name in directories if name not in EXCLUDED]
            for name in names:
                path = Path(folder) / name
                relative = path.relative_to(ROOT)
                if name.startswith(".env") and name != ".env.example":
                    continue
                if path.suffix in {".pyc", ".tsbuildinfo", ".zip", ".log"} or name == ".coverage":
                    continue
                archive.write(path, str(relative))
    with zipfile.ZipFile(OUT / "autocheck-source.zip") as archive:
        for info in archive.infolist():
            content = archive.read(info).decode("utf-8", errors="ignore")
            for value in private.values():
                if len(value) > 30 and value in content and value not in public.values():
                    raise ValueError("Private configuration found in source archive")
        print(f"Source archive verified: {len(archive.infolist())} files; no configured private keys included.")
    print("Hosting settings saved privately under deployment/ (excluded from Git and source archive).")


if __name__ == "__main__":
    main()
