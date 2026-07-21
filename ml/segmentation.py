"""K-Means Customer Segmentation ML pipeline."""

import logging
import pandas as pd
import numpy as np
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
import joblib
from pathlib import Path

logger = logging.getLogger(__name__)


def prepare_segmentation_features(df: pd.DataFrame, mapping: dict) -> pd.DataFrame:
    """Group transactional data by customer to build Total Spend, Frequency, and Avg Order Value."""
    # Find mapped columns
    rev_col = mapping.get("revenue_col")
    cust_col = mapping.get("customer_col")

    if not rev_col or not cust_col:
        raise ValueError("Customer and Revenue columns must be mapped for segmentation.")

    if cust_col not in df.columns or rev_col not in df.columns:
        raise ValueError(
            f"Mapped customer/revenue columns ({cust_col}/{rev_col}) not found in dataset."
        )

    # Convert revenue to numeric
    df[rev_col] = pd.to_numeric(df[rev_col], errors="coerce").fillna(0.0)

    # Aggregate RFM features
    features = (
        df.groupby(cust_col)
        .agg(
            total_spend=(rev_col, "sum"),
            frequency=(rev_col, "count"),
            avg_order_value=(rev_col, "mean"),
        )
        .reset_index()
    )

    # Clean extreme zeroes
    features = features[features["total_spend"] > 0]
    return features


def train_segmentation(df_features: pd.DataFrame) -> tuple[KMeans, StandardScaler, dict, pd.DataFrame]:
    """Train K-Means (n_clusters=3) on customer RFM features.

    Returns the model, scaler, evaluation metrics, and profiles.
    """
    X = df_features[["total_spend", "frequency", "avg_order_value"]]

    # Standardize features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Default to 3 clusters
    n_clusters = min(3, len(X) - 1)
    if n_clusters < 2:
        # Fallback if too few rows
        df_features["segment"] = 0
        df_features["segment_name"] = "All Customers"
        metrics = {"silhouette": 1.0, "cluster_sizes": {0: len(X)}}
        profiles = {
            0: {
                "name": "All Customers",
                "avg_spend": float(df_features["total_spend"].mean()),
                "avg_frequency": float(df_features["frequency"].mean()),
                "size": len(X),
            }
        }
        # Create dummy KMeans/Scaler for compatibility
        kmeans = KMeans(n_clusters=1, random_state=42).fit(X_scaled)
        return kmeans, scaler, metrics, df_features

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(X_scaled)
    df_features["segment"] = labels

    # Calculate Silhouette score
    sil = float(silhouette_score(X_scaled, labels))

    # Profile segments and assign clear names based on average total spend
    # Group and sort by mean total_spend to label them consistently:
    # 0 = At-Risk (Low Spend), 1 = Regular (Medium Spend), 2 = Champions (High Spend)
    means = df_features.groupby("segment")["total_spend"].mean().sort_values()
    sorted_segments = list(means.index)

    name_mapping = {}
    names = ["At-Risk Customers", "Regular Buyers", "Champions / High-Value"]
    for idx, seg in enumerate(sorted_segments):
        name_mapping[seg] = names[min(idx, len(names) - 1)]

    df_features["segment_name"] = df_features["segment"].map(name_mapping)

    # Extract profiles metadata
    cluster_sizes = {}
    profiles = {}
    for seg in range(n_clusters):
        seg_data = df_features[df_features["segment"] == seg]
        size = len(seg_data)
        cluster_sizes[int(seg)] = size
        profiles[int(seg)] = {
            "name": name_mapping.get(seg, f"Segment {seg}"),
            "avg_spend": float(seg_data["total_spend"].mean()) if size > 0 else 0.0,
            "avg_frequency": float(seg_data["frequency"].mean()) if size > 0 else 0.0,
            "avg_order_value": float(seg_data["avg_order_value"].mean()) if size > 0 else 0.0,
            "size": size,
            "proportion": float(size / len(df_features) * 100),
        }

    metrics = {
        "silhouette": round(sil * 100, 1),
        "cluster_sizes": cluster_sizes,
        "profiles": profiles,
    }

    return kmeans, scaler, metrics, df_features
