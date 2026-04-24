from pathlib import Path

import joblib


def _print_pipeline_structure(model) -> None:
    """Print available introspection details for sklearn pipelines/estimators."""
    print("\n=== Model Type ===")
    print(type(model).__name__)

    named_steps = getattr(model, "named_steps", None)
    if named_steps:
        print("\n=== Pipeline Steps ===")
        for name, step in named_steps.items():
            print(f"- {name}: {type(step).__name__}")

        preprocessor = named_steps.get("preprocessor")
        if preprocessor is not None:
            transformers = getattr(preprocessor, "transformers", None)
            if transformers:
                print("\n=== Preprocessor Transformers ===")
                for transformer_name, transformer_obj, columns in transformers:
                    if isinstance(columns, (list, tuple)):
                        print(f"- {transformer_name}: {len(columns)} columns")
                        print(f"  columns: {list(columns)}")
                    else:
                        print(f"- {transformer_name}: columns={columns}")


def debug_model_b() -> None:
    """
    Load Model B and print expected input columns from the saved artifact.
    Falls back to pipeline structure inspection when feature_names_in_ is absent.
    """
    root = Path(__file__).resolve().parents[1]
    model_path = root / "model" / "model_b" / "model_hormonal.pkl"

    print("=== Model B Path ===")
    print(model_path)

    if not model_path.exists():
        raise FileNotFoundError(f"Model file not found: {model_path}")

    model = joblib.load(model_path)

    print("\n=== Expected Input Columns ===")
    feature_names = getattr(model, "feature_names_in_", None)
    if feature_names is not None:
        for idx, col in enumerate(feature_names, start=1):
            print(f"{idx:>3}. {col}")
        return

    print("feature_names_in_ is not available on this model.")
    print("Inspecting pipeline/estimator structure instead...")
    _print_pipeline_structure(model)


if __name__ == "__main__":
    debug_model_b()
