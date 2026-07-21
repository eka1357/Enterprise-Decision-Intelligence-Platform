"""Tests for the ETL profiling and cleaning pipeline."""

import os
import pandas as pd
import pytest
from etl.pipeline import (
    detect_column_types,
    detect_outliers_iqr,
    check_schema_drift,
    clean_column_names,
    auto_clean_data,
    run_pipeline,
)


def test_detect_column_types() -> None:
    """Verifies that columns are classified into semantic types correctly."""
    df = pd.DataFrame(
        {
            "num_col": [1, 2, 3, 4, 5] * 12,
            "cat_col": ["A", "B", "A", "B", "A"] * 12,
            "text_col": [f"Unique string {i} with long description here" for i in range(60)],
            "date_col": ["2026-07-01", "2026-07-02", "2026-07-03", "2026-07-04", "2026-07-05"] * 12,
        }
    )
    # Ensure date_col is converted to datetime or parsed correctly
    col_types = detect_column_types(df)
    assert col_types["num_col"] == "numeric"
    assert col_types["cat_col"] == "categorical"
    assert col_types["text_col"] == "text"
    assert col_types["date_col"] == "datetime"


def test_detect_outliers_iqr() -> None:
    """Verifies that numeric outlier rows are identified correctly."""
    series = pd.Series([10, 12, 11, 13, 12, 10, 100, 11, 12, -50])
    outliers = detect_outliers_iqr(series)
    # 100 and -50 are outliers
    assert len(outliers) == 2
    assert 6 in outliers  # index of 100
    assert 9 in outliers  # index of -50


def test_check_schema_drift() -> None:
    """Verifies that schema drift is correctly flagged."""
    df = pd.DataFrame({"col_a": [1, 2], "col_b": ["x", "y"]})
    previous_schema = [
        {"name": "col_a", "dtype": "int64"},
        {"name": "col_c", "dtype": "float64"},  # col_b is new, col_c is missing
    ]
    drift = check_schema_drift(df, previous_schema)
    assert drift is not None
    assert drift["drift_detected"] is True
    assert "col_c" in drift["missing_columns"]
    assert "col_b" in drift["new_columns"]


def test_clean_column_names() -> None:
    """Verifies standardizing of messy column names."""
    df = pd.DataFrame(columns=["First Name", "AGE-group", "salary!!", "First Name"])
    cleaned_df = clean_column_names(df)
    expected_cols = ["first_name", "age_group", "salary", "first_name_1"]
    assert list(cleaned_df.columns) == expected_cols


def test_auto_clean_data() -> None:
    """Verifies duplicate removal and column-type aware missing value imputations."""
    df = pd.DataFrame(
        {
            "age": [20, 20, 30, None],
            "status": ["active", "active", None, "inactive"],
        }
    )
    col_types = {"age": "numeric", "status": "categorical"}
    df_clean, actions = auto_clean_data(df, col_types)

    # Duplicate row index 1 should be dropped
    assert len(df_clean) == 3
    # Null age should be filled with median (25)
    assert df_clean["age"].isnull().sum() == 0
    assert df_clean["age"].iloc[2] == 25.0
    # Null status should be filled with mode ('active')
    assert df_clean["status"].isnull().sum() == 0
    assert df_clean["status"].iloc[1] == "active"

    assert len(actions) == 2  # duplicate drop + null imputations


def test_run_pipeline(tmp_path) -> None:
    """End to end test on a messy synthetic CSV file."""
    csv_content = (
        "Name,Age,Salary,Joined\n"
        "Alice,25,50000,2026-01-01\n"
        "Bob,30,60000,2026-02-01\n"
        "Charlie,,55000,2026-03-01\n"
        "Alice,25,50000,2026-01-01\n"  # duplicate
        "Dave,150,45000,2026-04-01\n"  # outlier age
    )
    csv_file = tmp_path / "messy_data.csv"
    csv_file.write_text(csv_content)

    report = run_pipeline(str(csv_file))

    assert report["overall_score"] < 100.0
    assert report["summary"]["total_rows"] == 5
    assert report["summary"]["duplicate_rows"] == 1
    assert report["summary"]["missing_values"] == 1
    assert report["summary"]["outliers_found"] == 1  # 150 is an outlier

    # Cleaned file should exist and have duplicate dropped
    assert os.path.exists(report["cleaned_file_path"])
    df_clean = pd.read_csv(report["cleaned_file_path"])
    assert len(df_clean) == 4
