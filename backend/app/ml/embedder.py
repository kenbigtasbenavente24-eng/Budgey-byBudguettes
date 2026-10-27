"""Image -> embedding.

The real CNN (pre-trained feature extractor, TFLite or PyTorch) is still being
decided. Anything that implements `Embedder` can be swapped in via
`get_embedder()` without touching the routers.
"""
from functools import lru_cache
from typing import Protocol

import numpy as np
from PIL import Image
import torch
import torchvision.models as models
import torchvision.transforms as transforms


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, image: Image.Image) -> np.ndarray:
        """Return an L2-normalised float32 vector of length `dim`."""
        ...


class ResNetEmbedder:
    """Pre-trained ResNet18 feature extractor for product image recognition."""

    name = "resnet18-pytorch"
    dim = 512

    def __init__(self):
        # Load pre-trained ResNet18 weights
        weights = models.ResNet18_Weights.DEFAULT
        self.model = models.resnet18(weights=weights)
        
        # Remove the final classification layer to use it purely as a feature extractor
        self.feature_extractor = torch.nn.Sequential(*list(self.model.children())[:-1])
        self.feature_extractor.eval()

        # Standard ImageNet transformation pipeline
        self.transform = transforms.Compose([
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406], 
                std=[0.229, 0.224, 0.225]
            ),
        ])

    def embed(self, image: Image.Image) -> np.ndarray:
        # Ensure image is RGB
        img = image.convert("RGB")
        tensor = self.transform(img).unsqueeze(0)  # Add batch dimension

        with torch.no_grad():
            features = self.feature_extractor(tensor)

        # Flatten into a 1D vector
        vec = features.flatten().numpy()

        # L2-normalize the vector
        norm = np.linalg.norm(vec)
        return (vec / norm if norm > 0 else vec).astype(np.float32)


@lru_cache(maxsize=1)
def get_embedder() -> Embedder:
    # Swapped from PlaceholderEmbedder to the real PyTorch ResNetEmbedder
    return ResNetEmbedder()