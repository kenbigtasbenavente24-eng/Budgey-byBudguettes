"""Image classification using the fine-tuned ResNet18 model (v1.2 - 5 Classes)."""

from functools import lru_cache
from typing import Protocol
import os
import numpy as np
from PIL import Image
import torch
import torchvision.models as models
import torchvision.transforms as transforms

class Classifier(Protocol):
    name: str

    def classify(self, image: Image.Image) -> dict:
        """Return predicted category and confidence."""
        ...

class SquarePad:
    """Matches the padding transformation used during v1.2 training."""
    def __call__(self, image):
        w, h = image.size
        max_wh = max(w, h)
        hp = (max_wh - w) // 2
        vp = (max_wh - h) // 2
        padding = (hp, vp, max_wh - w - hp, max_wh - h - vp)
        return transforms.functional.pad(image, padding, fill=0, padding_mode='constant')

class ResNetClassifier:
    """Fine-tuned ResNet18 classifier for Budgey product categories (5-class v1.2)."""

    name = "resnet18-classifier-pytorch-v1.2"

    def __init__(self):
        # Initialize ResNet18 structure
        self.model = models.resnet18(weights=None)
        
        # Modify final classification layer to match 5 classes (with Dropout matching training)
        num_features = self.model.fc.in_features
        self.model.fc = torch.nn.Sequential(
            torch.nn.Dropout(0.3),
            torch.nn.Linear(num_features, 5)
        )
        
        # Load your v1.2 trained model weights checkpoint from backend root
        # Resolved from this file (backend/app/ml/ -> backend/), so it works no matter
        # which folder the server is started from.
        model_path = os.path.normpath(
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "budgey_classifier_v1.2.pt")
        )
        if not os.path.exists(model_path):
            # Fail loudly: serving predictions from untrained weights is worse than an error.
            raise FileNotFoundError(f"Model weights not found at {model_path}")

        self.model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))
        print(f"Successfully loaded model weights from {model_path}")

        self.model.eval()

        # Standard transformation pipeline including SquarePad to prevent aspect-ratio stretching
        self.transform = transforms.Compose([
            SquarePad(),
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406], 
                std=[0.229, 0.224, 0.225]
            ),
        ])
        
        # CRITICAL: Must match PyTorch ImageFolder's strict alphabetical order from v1.2 training:
        # 0: clothing, 1: drinks, 2: food, 3: others, 4: shoes
        self.classes = ["clothing", "drinks", "food", "others", "shoes"]

        def classify(self, image: Image.Image) -> dict:
        img = image.convert("RGB")
        tensor = self.transform(img).unsqueeze(0)

        with torch.no_grad():
            outputs = self.model(tensor)
            probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
            predicted_idx = torch.argmax(probabilities).item()
            confidence = probabilities[predicted_idx].item()

        category = self.classes[predicted_idx]
        
        # Confidence threshold safeguard (85%)
        CONFIDENCE_THRESHOLD = 0.85
        
        # PUT IT HERE: Only force a fallback to 'others' if it's a main category failing the threshold
        if category != "others" and confidence < CONFIDENCE_THRESHOLD:
            category = "others"

        return {
            "category": category,
            "confidence": round(float(confidence), 4)
        }

@lru_cache(maxsize=1)
def get_classifier() -> Classifier:
    return ResNetClassifier()

# Backward compatibility alias
get_embedder = get_classifier