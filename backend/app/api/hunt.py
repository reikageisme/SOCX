from fastapi import APIRouter, Depends, HTTPException
from typing import Dict, Any, List
from pydantic import BaseModel
import logging

from app.api.endpoints import get_current_user
from app.services.ai.provider import AIProviderFactory
from app.core.clickhouse import clickhouse_storage

router = APIRouter()
logger = logging.getLogger(__name__)

class HuntQuery(BaseModel):
    query: str

class HuntResult(BaseModel):
    sql: str
    results: List[Dict[str, Any]]
    error: str = ""

@router.post("/query", response_model=HuntResult)
async def ai_threat_hunt(query: HuntQuery, current_user: str = Depends(get_current_user)):
    """Translate Natural Language to SQL and execute on ClickHouse."""
    if not clickhouse_storage._connected or not clickhouse_storage.client:
        return HuntResult(sql="", results=[], error="ClickHouse is not connected or enabled.")

    provider = AIProviderFactory.get_provider()
    
    try:
        # Translate to SQL
        sql = await provider.translate_nl_to_sql(query.query)
        if not sql:
            return HuntResult(sql="", results=[], error="Failed to translate query to SQL.")
            
        # Security validation (very basic, prevent DROP/DELETE)
        upper_sql = sql.upper()
        if any(bad in upper_sql for bad in ["DROP", "DELETE", "TRUNCATE", "ALTER", "INSERT", "UPDATE"]):
            return HuntResult(sql=sql, results=[], error="SQL query contains forbidden operations.")

        # Execute on ClickHouse
        result = clickhouse_storage.client.query(sql)
        
        # Format results
        columns = result.column_names
        rows = result.result_rows
        formatted_results = [dict(zip(columns, row)) for row in rows]
        
        return HuntResult(sql=sql, results=formatted_results)
    except Exception as e:
        logger.error(f"Threat Hunt query failed: {e}")
        return HuntResult(sql=sql if 'sql' in locals() else "", results=[], error=str(e))
