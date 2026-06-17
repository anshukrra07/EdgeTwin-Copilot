import onnxruntime as ort
import os

class ModelRegistry:
    """
    Loads the correct ONNX model for a given machine_type.
    Models are loaded lazily and cached in memory.
    """
    def __init__(self, models_dir: str = None):
        if models_dir is None:
            models_dir = os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "models"
            )
        self._models_dir = models_dir
        self._cache = {}  # machine_type -> {isolation_forest: session, xgboost: session}

    def get_models(self, machine_type: str) -> dict:
        if machine_type not in self._cache:
            model_path = os.path.join(self._models_dir, machine_type)
            if not os.path.exists(model_path):
                raise FileNotFoundError(f"Model path {model_path} does not exist.")
                
            self._cache[machine_type] = {
                "isolation_forest": ort.InferenceSession(os.path.join(model_path, "isolation_forest.onnx")),
                "xgboost": ort.InferenceSession(os.path.join(model_path, "xgboost_classifier.onnx"))
            }
        return self._cache[machine_type]

    def reload_models(self, machine_type: str) -> dict:
        """Clears cache for the machine type and forces reloading sessions from disk."""
        if machine_type in self._cache:
            del self._cache[machine_type]
        return self.get_models(machine_type)
