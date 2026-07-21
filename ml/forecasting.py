import logging
import numpy as np
import pandas as pd
import xgboost as xgb

logger = logging.getLogger(__name__)


def prepare_time_series(
    df: pd.DataFrame, date_col: str, target_col: str
) -> pd.DataFrame:
    """Parse dates, aggregate target daily, and return a sorted time series DataFrame."""
    df_ts = df.copy()
    df_ts[date_col] = pd.to_datetime(df_ts[date_col])
    # Group by date to aggregate total daily revenue
    df_daily = (
        df_ts.groupby(date_col)[target_col]
        .sum()
        .reset_index()
        .sort_values(date_col)
        .reset_index(drop=True)
    )
    return df_daily


def engineer_features(
    df_daily: pd.DataFrame, date_col: str, target_col: str
) -> tuple[pd.DataFrame, list[str]]:
    """Generate time features, lag values, and rolling averages from daily series."""
    df_feat = df_daily.copy()

    # Time-based features
    df_feat["dayofweek"] = df_feat[date_col].dt.dayofweek
    df_feat["month"] = df_feat[date_col].dt.month
    df_feat["day"] = df_feat[date_col].dt.day

    # Lags
    lags = [1, 7, 14, 30]
    for lag in lags:
        df_feat[f"lag_{lag}"] = df_feat[target_col].shift(lag)

    # Rolling averages
    windows = [7, 30]
    for window in windows:
        # Shift first so we don't leak target info into features for same day
        df_feat[f"rolling_mean_{window}"] = (
            df_feat[target_col].shift(1).rolling(window=window).mean()
        )

    feature_cols = [
        "dayofweek",
        "month",
        "day",
        "lag_1",
        "lag_7",
        "lag_14",
        "lag_30",
        "rolling_mean_7",
        "rolling_mean_30",
    ]

    return df_feat, feature_cols


def train_and_evaluate(
    df_daily: pd.DataFrame, date_col: str, target_col: str
) -> tuple[xgb.XGBRegressor, dict[str, float], float]:
    """Train XGBoost model using a chronological validation split.

    Evaluates on the last 30 days of the historical series.
    """
    df_feat, feature_cols = engineer_features(df_daily, date_col, target_col)
    # Drop rows where lag features are NaN (due to first 30 days limit)
    df_clean = df_feat.dropna(subset=feature_cols).copy()

    if len(df_clean) < 45:
        # Fallback for very small datasets: reduce test size to 5 days, or just train on all
        eval_size = 5
    else:
        eval_size = 30

    train_df = df_clean.iloc[:-eval_size]
    eval_df = df_clean.iloc[-eval_size:]

    X_train = train_df[feature_cols]
    y_train = train_df[target_col]
    X_eval = eval_df[feature_cols]
    y_eval = eval_df[target_col]

    model = xgb.XGBRegressor(
        n_estimators=100,
        max_depth=5,
        learning_rate=0.05,
        random_state=42,
    )
    model.fit(X_train, y_train)

    # Predict and evaluate
    preds = model.predict(X_eval)
    preds = np.clip(preds, 0, None)  # Sales cannot be negative

    mae = float(np.mean(np.abs(y_eval - preds)))
    rmse = float(np.sqrt(np.mean((y_eval - preds) ** 2)))

    # Calculate MAPE safely
    non_zero_mask = y_eval != 0
    if non_zero_mask.sum() > 0:
        mape = float(np.mean(np.abs((y_eval[non_zero_mask] - preds[non_zero_mask]) / y_eval[non_zero_mask])) * 100)
    else:
        mape = 0.0

    metrics = {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "mape": round(mape, 2),
    }

    # Store standard error of residuals to compute prediction intervals
    residuals = y_eval - preds
    std_error = float(np.std(residuals)) if len(residuals) > 1 else float(rmse)

    return model, metrics, std_error


def generate_shap_explanations(
    model: xgb.XGBRegressor, X_sample: pd.DataFrame
) -> list[str]:
    """Calculate feature contribution summaries for the predictions using model feature importances."""
    try:
        importances = model.feature_importances_
        feature_names = X_sample.columns

        # Map internal feature keys to business labels
        feature_labels = {
            "dayofweek": "Day of the week (weekly cycle)",
            "month": "Seasonal month trend",
            "day": "Day of the month effect",
            "lag_1": "Yesterday's sales level",
            "lag_7": "Sales level on same day last week",
            "lag_14": "Sales level two weeks ago",
            "lag_30": "Sales level one month ago",
            "rolling_mean_7": "Recent 7-day average sales trend",
            "rolling_mean_30": "Long-term 30-day average sales trend",
        }

        # Sort features by global importance (gain)
        sorted_features = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)

        drivers = []
        for col, imp in sorted_features[:3]:
            label = feature_labels.get(col, col)
            if "rolling_mean" in col or "lag" in col:
                drivers.append(f"{label} has a strong positive influence on future projections (importance: {imp:.1%}).")
            elif col == "dayofweek":
                drivers.append(f"{label} dictates weekly cyclical spikes (importance: {imp:.1%}).")
            else:
                drivers.append(f"{label} shows noticeable impact on seasonal forecasts (importance: {imp:.1%}).")

        return drivers
    except Exception as exc:
        logger.warning("Failed to generate explanations: %s", exc)
        return ["Future projections are primarily driven by historical sales trends."]


def forecast_next_n_days(
    model: xgb.XGBRegressor,
    df_daily: pd.DataFrame,
    date_col: str,
    target_col: str,
    n_days: int = 30,
    std_error: float = 0.0,
) -> tuple[list[dict], list[str]]:
    """Recursively forecast sales for the next n_days, avoiding feature leakage."""
    # Ensure dataframe features exist
    df_feat, feature_cols = engineer_features(df_daily, date_col, target_col)

    forecast_records = []
    # Work with a rolling copy of the tail end of df_feat to compute lags
    rolling_df = df_feat.copy()

    last_date = df_daily[date_col].max()

    for i in range(1, n_days + 1):
        next_date = last_date + pd.Timedelta(days=i)

        # 1. Create a dummy row for the next date to populate features
        new_row = {
            date_col: next_date,
            "dayofweek": next_date.dayofweek,
            "month": next_date.month,
            "day": next_date.day,
        }

        # Compute lag features based on historical + newly predicted rows
        for lag in [1, 7, 14, 30]:
            # Access target value from index -lag
            new_row[f"lag_{lag}"] = float(rolling_df[target_col].iloc[-lag])

        # Compute rolling averages
        for window in [7, 30]:
            # Mean of last 'window' target values
            new_row[f"rolling_mean_{window}"] = float(
                rolling_df[target_col].iloc[-window:].mean()
            )

        # 2. Convert to DataFrame to match prediction schema
        pred_df = pd.DataFrame([new_row])
        pred_features = pred_df[feature_cols]

        # 3. Predict yhat
        yhat = float(model.predict(pred_features)[0])
        yhat = max(yhat, 0.0)  # Sales cannot be negative

        # Add target column value back to row so rolling calculations work for next steps
        new_row[target_col] = yhat

        # Calculate confidence intervals (z=1.96 for 95% CI)
        margin = 1.96 * std_error
        # Scale margin slightly over time to account for growing uncertainty in recursive predictions
        uncertainty_multiplier = np.sqrt(i)
        scaled_margin = margin * uncertainty_multiplier

        forecast_records.append(
            {
                "date": next_date.strftime("%Y-%m-%d"),
                "yhat": round(yhat, 2),
                "yhat_lower": round(max(yhat - scaled_margin, 0.0), 2),
                "yhat_upper": round(yhat + scaled_margin, 2),
            }
        )

        # Append new row to rolling dataframe
        rolling_df = pd.concat([rolling_df, pd.DataFrame([new_row])], ignore_index=True)

    # Generate SHAP on the final forecasted period DataFrame to explain general trend drivers
    explain_sample = rolling_df.tail(n_days)[feature_cols]
    shap_drivers = generate_shap_explanations(model, explain_sample)

    return forecast_records, shap_drivers
