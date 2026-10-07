import io
from django.core.files.base import ContentFile
from django.core.exceptions import ValidationError
from PIL import Image, ImageOps
from rest_framework.views import exception_handler as drf_handler

IMAGE_EXT = {"jpg", "jpeg", "png", "webp"}
VIDEO_EXT = {"mp4", "webm", "mov"}
MAX_IMAGE_MB, MAX_VIDEO_MB = 8, 50


def _ext(f):
    return f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""


def process_image(upload):
    """Validate (extension, size, real image content) then resize + compress to JPEG."""
    if _ext(upload) not in IMAGE_EXT:
        raise ValidationError("Only JPG, PNG or WEBP images are allowed.")
    if upload.size > MAX_IMAGE_MB * 1024 * 1024:
        raise ValidationError(f"Image is too large (max {MAX_IMAGE_MB}MB).")
    try:
        Image.open(upload).verify()
        upload.seek(0)
        img = ImageOps.exif_transpose(Image.open(upload)).convert("RGB")
    except Exception:
        raise ValidationError("This file is not a valid image.")
    img.thumbnail((1600, 1600))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=82, optimize=True)
    return ContentFile(buf.getvalue(), name=upload.name.rsplit(".", 1)[0] + ".jpg")


def validate_video(upload):
    if _ext(upload) not in VIDEO_EXT:
        raise ValidationError("Only MP4, WEBM or MOV videos are allowed.")
    if upload.size > MAX_VIDEO_MB * 1024 * 1024:
        raise ValidationError(f"Video is too large (max {MAX_VIDEO_MB}MB).")
    if upload.content_type and not upload.content_type.startswith("video/"):
        raise ValidationError("This file is not a video.")


def exception_handler(exc, context):
    """Consistent error shape: {"detail": "...", "errors": {...}}"""
    resp = drf_handler(exc, context)
    if resp is not None and isinstance(resp.data, dict) and "detail" not in resp.data:
        resp.data = {"detail": "Please check the form and try again.", "errors": resp.data}
    elif resp is not None and isinstance(resp.data, list):
        resp.data = {"detail": " ".join(map(str, resp.data))}
    return resp
