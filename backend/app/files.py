import io
import warnings

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError
from pypdf import PdfReader

MIMES = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}


def detect_type(data: bytes) -> str:
    """Validate actual document content, never browser-provided MIME types."""
    if data.startswith(b"%PDF-"):
        try:
            reader = PdfReader(io.BytesIO(data))
            if reader.is_encrypted or not 0 < len(reader.pages) <= 100:
                raise ValueError("Encrypted, empty or over 100 pages")
            return "application/pdf"
        except Exception as exc:
            raise HTTPException(
                400, "Upload an unlocked PDF with 1–100 pages."
            ) from exc
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                mime = MIMES.get(image.format or "")
                if not mime:
                    raise ValueError("Unsupported image")
                image.verify()
                return mime
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        SyntaxError,
        EOFError,
        Image.DecompressionBombError,
        Image.DecompressionBombWarning,
    ) as exc:
        raise HTTPException(
            400, "File is not a valid PDF, JPG, PNG or WEBP. Export it again and retry."
        ) from exc
