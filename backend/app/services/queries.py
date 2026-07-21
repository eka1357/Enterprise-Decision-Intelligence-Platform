"""Sales analytics service utilizing DuckDB to aggregate CSV data on disk."""

import logging
from datetime import datetime, timedelta
from typing import Any
import duckdb

logger = logging.getLogger(__name__)


def execute_duckdb_query(query: str, params: list | None = None) -> list[tuple]:
    """Execute a SQL query against DuckDB and return the result tuples."""
    conn = duckdb.connect(database=":memory:")
    try:
        if params:
            res = conn.execute(query, params).fetchall()
        else:
            res = conn.execute(query).fetchall()
        return res
    finally:
        conn.close()


def _get_previous_period(
    start_date: str | None, end_date: str | None, csv_min_date: str
) -> tuple[str, str]:
    """Calculate the start and end dates of the previous period.

    If start_date/end_date are not specified, compare against the previous year.
    """
    if not start_date or not end_date:
        # Default: compare against same dates last year
        now = datetime.now()
        start = datetime.strptime(csv_min_date[:10], "%Y-%m-%d")
        end = now
        days = (end - start).days
        prev_start = (start - timedelta(days=days)).strftime("%Y-%m-%d")
        prev_end = start.strftime("%Y-%m-%d")
        return prev_start, prev_end

    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")
    days = (end - start).days + 1

    prev_start = (start - timedelta(days=days)).strftime("%Y-%m-%d")
    prev_end = (start - timedelta(days=1)).strftime("%Y-%m-%d")
    return prev_start.strftime("%Y-%m-%d") if isinstance(prev_start, datetime) else prev_start, prev_end.strftime("%Y-%m-%d") if isinstance(prev_end, datetime) else prev_end


def get_sales_analytics(
    file_path: str,
    mapping: dict[str, str],
    start_date: str | None = None,
    end_date: str | None = None,
    granularity: str = "daily",
    category_filter: str | None = None,
    region_filter: str | None = None,
) -> dict[str, Any]:
    """Aggregate sales metrics via DuckDB from the cleaned CSV dataset.

    Args:
        file_path: Path to the cleaned CSV file.
        mapping: Column mappings dict (date_col, revenue_col, quantity_col, etc.)
        start_date: Filter range start (YYYY-MM-DD)
        end_date: Filter range end (YYYY-MM-DD)
        granularity: 'daily', 'weekly', 'monthly'
        category_filter: Optional Category drill-down
        region_filter: Optional Region drill-down
    """
    # Exclude directories/path injection
    escaped_file = file_path.replace("'", "''")

    date_col = mapping["date_col"]
    rev_col = mapping["revenue_col"]
    qty_col = mapping["quantity_col"]
    cat_col = mapping["category_col"]
    reg_col = mapping["region_col"]
    cust_col = mapping.get("customer_col")

    # Determine CSV date range bounds first to set defaults if none provided
    bounds_query = f"""
        SELECT 
            min(CAST("{date_col}" AS DATE)) as min_d, 
            max(CAST("{date_col}" AS DATE)) as max_d 
        FROM read_csv_auto('{escaped_file}')
    """
    bounds = execute_duckdb_query(bounds_query)[0]
    csv_min = str(bounds[0]) if bounds[0] else "2020-01-01"
    csv_max = str(bounds[1]) if bounds[1] else "2026-12-31"

    # Default date range to full dataset bounds if not filtered
    query_start = start_date if start_date else csv_min
    query_end = end_date if end_date else csv_max

    # Compute Previous Period dates
    prev_start, prev_end = _get_previous_period(start_date, end_date, csv_min)

    # Build SQL clauses for filters
    where_clauses = [
        f'CAST("{date_col}" AS DATE) >= CAST(? AS DATE)',
        f'CAST("{date_col}" AS DATE) <= CAST(? AS DATE)'
    ]
    params = [query_start, query_end]

    prev_where_clauses = [
        f'CAST("{date_col}" AS DATE) >= CAST(? AS DATE)',
        f'CAST("{date_col}" AS DATE) <= CAST(? AS DATE)'
    ]
    prev_params = [prev_start, prev_end]

    if category_filter:
        where_clauses.append(f'"{cat_col}" = ?')
        prev_where_clauses.append(f'"{cat_col}" = ?')
        params.append(category_filter)
        prev_params.append(category_filter)

    if region_filter:
        where_clauses.append(f'"{reg_col}" = ?')
        prev_where_clauses.append(f'"{reg_col}" = ?')
        params.append(region_filter)
        prev_params.append(region_filter)

    where_sql = " AND ".join(where_clauses)
    prev_where_sql = " AND ".join(prev_where_clauses)

    # 1. Query Current Period Metrics
    cust_select = f'count(distinct "{cust_col}")' if cust_col else "count(*)"
    current_metrics_query = f"""
        SELECT 
            COALESCE(sum(CAST("{rev_col}" AS DOUBLE)), 0.0) as total_rev,
            COALESCE(sum(CAST("{qty_col}" AS INTEGER)), 0) as total_qty,
            {cust_select} as total_cust,
            count(*) as tx_count
        FROM read_csv_auto('{escaped_file}')
        WHERE {where_sql}
    """
    cur_res = execute_duckdb_query(current_metrics_query, params)[0]
    cur_rev, cur_qty, cur_cust, cur_tx = cur_res
    cur_aov = cur_rev / cur_tx if cur_tx > 0 else 0.0

    # 2. Query Previous Period Metrics
    prev_metrics_query = f"""
        SELECT 
            COALESCE(sum(CAST("{rev_col}" AS DOUBLE)), 0.0) as total_rev,
            COALESCE(sum(CAST("{qty_col}" AS INTEGER)), 0) as total_qty,
            {cust_select} as total_cust,
            count(*) as tx_count
        FROM read_csv_auto('{escaped_file}')
        WHERE {prev_where_sql}
    """
    prev_res = execute_duckdb_query(prev_metrics_query, prev_params)[0]
    prev_rev, prev_qty, prev_cust, prev_tx = prev_res
    prev_aov = prev_rev / prev_tx if prev_tx > 0 else 0.0

    # Helper: calculate percentage change
    def pct_change(curr, prev):
        if prev == 0:
            return 100.0 if curr > 0 else 0.0
        return round(((curr - prev) / prev) * 100, 1)

    rev_change = pct_change(cur_rev, prev_rev)
    qty_change = pct_change(cur_qty, prev_qty)
    aov_change = pct_change(cur_aov, prev_aov)
    cust_change = pct_change(cur_cust, prev_cust)

    # 3. Determine Business Meaning String (Revenue Driver Analysis)
    # Find which category drove the revenue change
    driver_query = f"""
        WITH cur_cat AS (
            SELECT "{cat_col}" as cat, SUM(CAST("{rev_col}" AS DOUBLE)) as rev
            FROM read_csv_auto('{escaped_file}')
            WHERE {where_sql}
            GROUP BY 1
        ),
        prev_cat AS (
            SELECT "{cat_col}" as cat, SUM(CAST("{rev_col}" AS DOUBLE)) as rev
            FROM read_csv_auto('{escaped_file}')
            WHERE {prev_where_sql}
            GROUP BY 1
        )
        SELECT 
            COALESCE(c.cat, p.cat) as category,
            COALESCE(c.rev, 0.0) - COALESCE(p.rev, 0.0) as change_amount
        FROM cur_cat c
        FULL OUTER JOIN prev_cat p ON c.cat = p.cat
        ORDER BY ABS(change_amount) DESC
        LIMIT 1
    """
    driver_res = execute_duckdb_query(driver_query, params + prev_params)
    driver_str = ""
    if driver_res:
        top_cat, top_diff = driver_res[0]
        direction = "growth" if rev_change >= 0 else "decline"
        action = "grew" if rev_change >= 0 else "fell"
        driver_str = f"Sales {action} {abs(rev_change)}% vs last period, driven by Category '{top_cat}' with a difference of {'+' if top_diff >= 0 else ''}${top_diff:,.0f}."
    else:
        driver_str = f"Sales changed by {rev_change}% compared to the previous period."

    # 4. Trend Line Data
    date_trunc = "CAST(date_col AS DATE)"
    if granularity == "weekly":
        date_trunc = "date_trunc('week', CAST(date_col AS DATE))"
    elif granularity == "monthly":
        date_trunc = "date_trunc('month', CAST(date_col AS DATE))"

    trend_query = f"""
        SELECT 
            strftime('%Y-%m-%d', {date_trunc.replace('date_col', f'"{date_col}"')}) as dt,
            SUM(CAST("{rev_col}" AS DOUBLE)) as revenue,
            SUM(CAST("{qty_col}" AS INTEGER)) as quantity
        FROM read_csv_auto('{escaped_file}')
        WHERE {where_sql}
        GROUP BY 1
        ORDER BY 1
    """
    trend_res = execute_duckdb_query(trend_query, params)
    trend_data = [
        {"date": row[0], "revenue": round(row[1], 2), "quantity": int(row[2])}
        for row in trend_res
    ]

    # 5. Top Categories Bar Chart
    cat_query = f"""
        SELECT 
            "{cat_col}" as category,
            SUM(CAST("{rev_col}" AS DOUBLE)) as revenue,
            SUM(CAST("{qty_col}" AS INTEGER)) as quantity
        FROM read_csv_auto('{escaped_file}')
        WHERE {where_sql}
        GROUP BY 1
        ORDER BY revenue DESC
        LIMIT 10
    """
    cat_res = execute_duckdb_query(cat_query, params)
    cat_data = [
        {"category": row[0], "revenue": round(row[1], 2), "quantity": int(row[2])}
        for row in cat_res
    ]

    # 6. Region Breakdown Pie Chart
    reg_query = f"""
        SELECT 
            "{reg_col}" as region,
            SUM(CAST("{rev_col}" AS DOUBLE)) as revenue,
            SUM(CAST("{qty_col}" AS INTEGER)) as quantity
        FROM read_csv_auto('{escaped_file}')
        WHERE {where_sql}
        GROUP BY 1
        ORDER BY revenue DESC
    """
    reg_res = execute_duckdb_query(reg_query, params)
    reg_data = [
        {"region": row[0], "revenue": round(row[1], 2), "quantity": int(row[2])}
        for row in reg_res
    ]

    return {
        "kpis": {
            "revenue": {
                "label": "Total Revenue",
                "value": round(cur_rev, 2),
                "previous_value": round(prev_rev, 2),
                "percentage_change": rev_change,
                "business_meaning": driver_str
            },
            "quantity": {
                "label": "Units Sold",
                "value": int(cur_qty),
                "previous_value": int(prev_qty),
                "percentage_change": qty_change,
                "business_meaning": f"Total volume sold stands at {cur_qty:,} units (change of {qty_change}%)."
            },
            "aov": {
                "label": "Avg Order Value",
                "value": round(cur_aov, 2),
                "previous_value": round(prev_aov, 2),
                "percentage_change": aov_change,
                "business_meaning": f"Average ticket size is ${cur_aov:,.2f} per transaction."
            },
            "customers": {
                "label": "Customer Base",
                "value": int(cur_cust),
                "previous_value": int(prev_cust),
                "percentage_change": cust_change,
                "business_meaning": f"Active customer contacts engaged: {cur_cust:,}."
            }
        },
        "trend": trend_data,
        "categories": cat_data,
        "regions": reg_data,
        "filters": {
            "start_date": query_start,
            "end_date": query_end,
            "granularity": granularity,
            "category": category_filter,
            "region": region_filter
        }
    }
