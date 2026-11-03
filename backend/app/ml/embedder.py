"""Image classification using the fine-tuned ResNet18 model."""

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


class ResNetClassifier:
    """Fine-tuned ResNet18 classifier for Budgey product categories."""

    name = "resnet18-classifier-pytorch"

    def __init__(self):
        # Initialize ResNet18 structure (no default ImageNet weights needed since we load our fine-tuned .pt)
        self.model = models.resnet18(weights=None)
        
        # Modify the final classification layer to match your 4 classes
        num_features = self.model.fc.in_features
        self.model.fc = torch.nn.Linear(num_features, 4)
        
        # Load your trained model weights checkpoint
        model_path = os.path.join(os.path.dirname(__file__), "../../../budgey_classifier.pt")
        # Fallback path if placed directly in backend root
        if not os.path.exists(model_path):
            model_path = "budgey_classifier.pt"
            
        if os.path.exists(model_path):
            self.model.load_state_dict(torch.load(model_path, map_location=torch.device('cpu')))
        
        self.model.eval()

        # Standard transformation pipeline matching training
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406], 
                std=[0.229, 0.224, 0.225]
            ),
        ])
        
        self.classes = ["clothing", "shoes", "food", "drinks"]

    def classify(self, image: Image.Image) -> dict:
        img = image.convert("RGB")
        tensor = self.transform(img).unsqueeze(0)

        with torch.no_grad():
            outputs = self.model(tensor)
            probabilities = torch.nn.functional.softmax(outputs[0], dim=0)
            predicted_idx = torch.argmax(probabilities).item()
            confidence = probabilities[predicted_idx].item()

        return {
            "category": self.classes[predicted_idx],
            "confidence": round(float(confidence), 4)
        }


@lru_cache(maxsize=1)
def get_classifier() -> Classifier:
    return ResNetClassifier()
# Backward compatibility alias so health.py and other routers don't break
get_embedder = get_classifier