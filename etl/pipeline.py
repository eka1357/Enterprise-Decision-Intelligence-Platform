"""Data validation, profiling, and cleaning pipeline using Pandera and Pandas."""

import logging
import os
import re
from pathlib import Path
import numpy as np
import pandas as pd
import pandera as pa

logger = logging.getLogger(__name__)


def detect_column_types(df: pd.DataFrame) -> dict[str, str]:
    """Classify columns of a DataFrame into semantic types.

    Types: numeric, datetime, categorical, text.
    """
    col_types = {}
    for col in df.columns:
        dtype = df[col].dtype

        # Check for datetime
        if pd.api.types.is_datetime64_any_dtype(dtype):
            col_types[col] = "datetime"
            continue

        # Try to parse string column as datetime if it contains dates
        if pd.api.types.is_object_dtype(dtype) or pd.api.types.is_string_dtype(dtype):
            # Check a sample of non-null values
            sample_non_null = df[col].dropna().head(100)
            if not sample_non_null.empty:
                try:
                    # If pandas can parse it to datetime without error and with high confidence
                    parsed = pd.to_datetime(sample_non_null, errors="raise")
                    col_types[col] = "datetime"
                    continue
                except (ValueError, TypeError):
                    pass

        # Check numeric
        if pd.api.types.is_numeric_dtype(dtype):
            # If it's bool, treat as categorical
            if dtype == bool or pd.api.types.is_bool_dtype(dtype):
                col_types[col] = "categorical"
            else:
                col_types[col] = "numeric"
            continue

        # Check categorical vs text based on cardinality
        non_null_vals = df[col].dropna()
        if not non_null_vals.empty:
            unique_count = non_null_vals.nunique()
            total_count = len(non_null_vals)
            cardinality_ratio = unique_count / total_count

            # If unique values are small, or unique count is less than 50
            if unique_count < 50 or cardinality_ratio < 0.15:
                col_types[col] = "categorical"
            else:
                col_types[col] = "text"
        else:
            col_types[col] = "text"

    return col_types


def detect_outliers_iqr(series: pd.Series) -> list[int]:
    """Detect outliers using the Interquartile Range (IQR) method.

    Returns:
        List of row indices where outliers are located.
    """
    # Drop NaNs for calculation
    clean_series = series.dropna()
    if clean_series.empty or not pd.api.types.is_numeric_dtype(clean_series.dtype):
        return []

    q1 = clean_series.quantile(0.25)
    q3 = clean_series.quantile(0.75)
    iqr = q3 - q1

    lower_bound = q1 - 1.5 * iqr
    upper_bound = q3 + 1.5 * iqr

    outlier_mask = (series < lower_bound) | (series > upper_bound)
    return list(outlier_mask[outlier_mask].index)


def check_schema_drift(
    df: pd.DataFrame, previous_schema: list[dict] | None
) -> dict | None:
    """Compare the current schema with the previous schema to detect drift.

    Args:
        df: Current dataset DataFrame.
        previous_schema: List of column metadata dictionaries from previous run.
                         Example: [{"name": "col1", "dtype": "int64"}, ...]

    Returns:
        Drift details dictionary if drift is found, else None.
    """
    if not previous_schema:
        return None

    prev_cols = {col["name"]: col["dtype"] for col in previous_schema}
    curr_cols = {col: str(df[col].dtype) for col in df.columns}

    missing_cols = [col for col in prev_cols if col not in curr_cols]
    new_cols = [col for col in curr_cols if col not in prev_cols]

    type_mismatches = {}
    for col in prev_cols:
        if col in curr_cols:
            # Simplify types for comparison (e.g. float64 and int64 are both numericish, but strict is ok too)
            # Let's do a strict string type comparison for safety
            if prev_cols[col] != curr_cols[col]:
                type_mismatches[col] = {
                    "previous": prev_cols[col],
                    "current": curr_cols[col],
                }

    if missing_cols or new_cols or type_mismatches:
        return {
            "drift_detected": True,
            "missing_columns": missing_cols,
            "new_columns": new_cols,
            "type_mismatches": type_mismatches,
        }

    return None


def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """Standardize column names to snake_case, alphanumeric and underscores only."""
    new_columns = []
    for col in df.columns:
        # Convert to string, lowercase, replace spaces/hyphens with underscore
        clean_col = str(col).strip().lower()
        clean_col = re.sub(r"[\s\-]+", "_", clean_col)
        # Remove non-alphanumeric/non-underscore characters
        clean_col = re.sub(r"[^\w]+", "", clean_col)
        # Prevent empty column names
        if not clean_col:
            clean_col = "unnamed_column"
        new_columns.append(clean_col)

    # Resolve duplicates in standardized names
    seen = {}
    final_columns = []
    for col in new_columns:
        if col in seen:
            seen[col] += 1
            final_columns.append(f"{col}_{seen[col]}")
        else:
            seen[col] = 0
            final_columns.append(col)

    df_cleaned = df.copy()
    df_cleaned.columns = final_columns
    return df_cleaned


def auto_clean_data(
    df: pd.DataFrame, col_types: dict[str, str]
) -> tuple[pd.DataFrame, list[dict]]:
    """Clean the dataset: standardizes names, removes duplicates, fills missing values.

    Returns:
        Cleaned DataFrame and list of cleaning actions taken.
    """
    actions = []
    df_clean = df.copy()

    # 1. Standardize columns
    orig_cols = list(df_clean.columns)
    df_clean = clean_column_names(df_clean)
    new_cols = list(df_clean.columns)
    renamed = {orig: new for orig, new in zip(orig_cols, new_cols, strict=True) if orig != new}
    if renamed:
        actions.append({
            "step": "standardize_column_names",
            "details": f"Standardized {len(renamed)} column names to snake_case.",
            "mappings": renamed
        })

    # Update col_types keys to match cleaned columns
    cleaned_col_types = {}
    for orig, new in zip(orig_cols, new_cols, strict=True):
        cleaned_col_types[new] = col_types.get(orig, "text")

    # 2. Drop duplicates
    duplicate_count = df_clean.duplicated().sum()
    if duplicate_count > 0:
        df_clean.drop_duplicates(inplace=True)
        actions.append({
            "step": "remove_duplicate_rows",
            "details": f"Removed {duplicate_count} duplicate rows."
        })

    # 3. Fill missing values based on column type
    filled_nulls = {}
    for col, ctype in cleaned_col_types.items():
        null_count = df_clean[col].isnull().sum()
        if null_count > 0:
            if ctype == "numeric":
                fill_value = df_clean[col].median()
                if pd.isna(fill_value):
                    fill_value = 0
                df_clean[col] = df_clean[col].fillna(fill_value)
                filled_nulls[col] = {"strategy": "median", "value": float(fill_value), "count": int(null_count)}
            elif ctype == "categorical":
                mode_val = df_clean[col].mode()
                fill_value = mode_val.iloc[0] if not mode_val.empty else "Unknown"
                df_clean[col] = df_clean[col].fillna(fill_value)
                filled_nulls[col] = {"strategy": "mode", "value": str(fill_value), "count": int(null_count)}
            elif ctype == "datetime":
                # Fill with forward fill or mode/current time
                df_clean[col] = df_clean[col].ffill().bfill()
                # If still null (all null)
                if df_clean[col].isnull().any():
                    df_clean[col] = df_clean[col].fillna(pd.Timestamp.now())
                filled_nulls[col] = {"strategy": "forward_backward_fill", "count": int(null_count)}
            else:  # text
                df_clean[col] = df_clean[col].fillna("Unknown")
                filled_nulls[col] = {"strategy": "constant", "value": "Unknown", "count": int(null_count)}

    if filled_nulls:
        actions.append({
            "step": "fill_missing_values",
            "details": f"Imputed missing values in {len(filled_nulls)} columns.",
            "imputations": filled_nulls
        })

    return df_clean, actions


def run_pipeline(
    file_path: str, previous_schema: list[dict] | None = None
) -> dict:
    """Run the profiling, validation, and cleaning pipeline.

    Args:
        file_path: Path to the raw CSV file.
        previous_schema: Previous schema metadata list to check drift.

    Returns:
        Quality profile report dict.
    """
    df = pd.read_csv(file_path)
    total_rows = len(df)
    total_cols = len(df.columns)

    if total_rows == 0:
        return {
            "overall_score": 0.0,
            "summary": {
                "total_rows": 0,
                "total_columns": total_cols,
                "duplicate_rows": 0,
                "missing_values": 0,
                "outliers_found": 0,
            },
            "columns": {},
            "issues": [{"level": "error", "message": "Dataset is empty."}],
            "cleaning_actions": []
        }

    # 1. Detect Types & Infer Schema via Pandera
    col_types = detect_column_types(df)

    # Build pandera schema validation checks
    pa_fields = {}
    for col, ctype in col_types.items():
        if ctype == "numeric":
            pa_fields[col] = pa.Column(pa.Float, coerce=True, nullable=True)
        elif ctype == "datetime":
            pa_fields[col] = pa.Column(pa.DateTime, coerce=True, nullable=True)
        else:
            pa_fields[col] = pa.Column(pa.String, coerce=True, nullable=True)

    schema = pa.DataFrameSchema(pa_fields)

    # Run check validation (Pandera handles format coercions & null validation checks)
    validation_passed = True
    validation_errors = []
    try:
        schema.validate(df, lazy=True)
    except pa.errors.SchemaErrors as err:
        validation_passed = False
        for failure in err.schema_errors:
            validation_errors.append({
                "column": failure.column,
                "reason": str(failure.reason_code) if failure.reason_code else "invalid_type",
                "message": str(failure)
            })

    # 2. Check Schema Drift
    drift = check_schema_drift(df, previous_schema)

    # 3. Profiling stats & Outliers
    columns_profile = {}
    total_missing = 0
    total_outliers = 0
    issues = []

    if drift:
        issues.append({
            "level": "warning",
            "category": "schema_drift",
            "message": f"Schema drift detected. New columns: {drift['new_columns']}, Missing: {drift['missing_columns']}"
        })

    duplicate_rows = int(df.duplicated().sum())
    if duplicate_rows > 0:
        issues.append({
            "level": "warning",
            "category": "duplicate_rows",
            "message": f"Dataset contains {duplicate_rows} duplicate rows."
        })

    for col in df.columns:
        null_count = int(df[col].isnull().sum())
        total_missing += null_count
        unique_count = int(df[col].nunique())
        missing_pct = (null_count / total_rows) * 100

        col_profile = {
            "name": col,
            "type": col_types[col],
            "null_count": null_count,
            "missing_percentage": round(missing_pct, 2),
            "unique_count": unique_count,
        }

        # Outliers & Stats for numeric columns
        if col_types[col] == "numeric":
            clean_col = df[col].dropna()
            if not clean_col.empty:
                col_profile.update({
                    "mean": float(clean_col.mean()),
                    "median": float(clean_col.median()),
                    "min": float(clean_col.min()),
                    "max": float(clean_col.max()),
                    "std": float(clean_col.std()) if len(clean_col) > 1 else 0.0,
                })
                outliers = detect_outliers_iqr(df[col])
                col_profile["outlier_count"] = len(outliers)
                total_outliers += len(outliers)

                if len(outliers) > 0:
                    issues.append({
                        "level": "info",
                        "category": "outliers",
                        "column": col,
                        "message": f"Column '{col}' has {len(outliers)} numeric outliers."
                    })
            else:
                col_profile.update({"mean": None, "median": None, "min": None, "max": None, "std": None, "outlier_count": 0})
        # Top categories for categorical columns
        elif col_types[col] == "categorical":
            clean_col = df[col].dropna()
            if not clean_col.empty:
                top_cats = clean_col.value_counts().head(5).to_dict()
                col_profile["top_categories"] = [
                    {"value": str(k), "count": int(v)} for k, v in top_cats.items()
                ]
            else:
                col_profile["top_categories"] = []

        if missing_pct > 10.0:
            issues.append({
                "level": "warning",
                "category": "missing_values",
                "column": col,
                "message": f"Column '{col}' is missing {round(missing_pct, 1)}% of values."
            })

        columns_profile[col] = col_profile

    # 4. Compute Composite Quality Score
    # Completeness (0-1)
    completeness_score = 1.0 - (total_missing / (total_rows * total_cols)) if total_rows > 0 else 0.0
    # Uniqueness (0-1)
    uniqueness_score = 1.0 - (duplicate_rows / total_rows) if total_rows > 0 else 0.0
    # Validity (0-1)
    validity_score = 1.0 if validation_passed else max(1.0 - (len(validation_errors) / total_rows), 0.0)
    # Consistency (0-1)
    consistency_score = 0.5 if drift else 1.0

    # Weighted Average
    overall_score = (
        0.4 * completeness_score
        + 0.3 * validity_score
        + 0.2 * uniqueness_score
        + 0.1 * consistency_score
    ) * 100

    # 5. Clean dataset
    df_clean, cleaning_actions = auto_clean_data(df, col_types)

    # Save cleaned file
    cleaned_file_dir = Path(file_path).parent
    cleaned_file_name = f"cleaned_{Path(file_path).name}"
    cleaned_file_path = cleaned_file_dir / cleaned_file_name
    df_clean.to_csv(cleaned_file_path, index=False)

    report = {
        "overall_score": round(overall_score, 1),
        "validation_passed": validation_passed,
        "summary": {
            "total_rows": total_rows,
            "total_columns": total_cols,
            "duplicate_rows": duplicate_rows,
            "missing_values": total_missing,
            "outliers_found": total_outliers,
        },
        "metrics": {
            "completeness": round(completeness_score * 100, 1),
            "uniqueness": round(uniqueness_score * 100, 1),
            "validity": round(validity_score * 100, 1),
            "consistency": round(consistency_score * 100, 1),
        },
        "columns": columns_profile,
        "issues": issues,
        "cleaning_actions": cleaning_actions,
        "cleaned_file_path": str(cleaned_file_path)
    }

    return report
