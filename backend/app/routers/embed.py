import io

from fastapi import APIRouter, File, HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.config import settings
from app.ml.embedder import get_classifier

router = APIRouter(prefix="/v1", tags=["cnn"])


@router.post("/classify", response_model=dict)
def classify_image(file: UploadFile = File(...)):
    """Take an uploaded product photo, run it through the fine-tuned ResNet18 classifier, 
    and return the predicted category and confidence."""
    data = file.file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "Image too large")
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except (UnidentifiedImageError, OSError):
        raise HTTPException(415, "Unsupported or corrupt image")

    classifier = get_classifier()
    result = classifier.classify(image)
    return {
        "model": classifier.name,
        **result
    }