"""
ClickHouse event storage service.

Stores all threat events for historical analysis, compliance reporting,
and attack-path replay — replacing the ephemeral 150-event Zustand buffer
with a durable time-series store.

Schema uses a MergeTree engine partitioned by day, ordered by timestamp,
so queries like "all events from source X in the last 7 days" are fast.
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# clickhouse-connect is optional — the service degrades gracefully
try:
    import clickhouse_connect
    HAS_CLICKHOUSE = True
except ImportError:
    HAS_CLICKHOUSE = False
    logger.warning(
        "clickhouse-connect not installed. "
        "ClickHouse event storage disabled. "
        "Install with: pip install clickhouse-connect"
    )


CREATE_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS threat_events (
    id              String,
    source_kind     LowCardinality(String) DEFAULT 'local_sensor',
    source_ip       String DEFAULT '',
    source_lat      Float64 DEFAULT 0,
    source_lng      Float64 DEFAULT 0,
    source_country  LowCardinality(String) DEFAULT 'Unknown',
    dest_ip         String DEFAULT '',
    dest_lat        Float64 DEFAULT 0,
    dest_lng        Float64 DEFAULT 0,
    dest_country    LowCardinality(String) DEFAULT 'Unknown',
    severity        LowCardinality(String) DEFAULT 'low',
    event_type      LowCardinality(String) DEFAULT '',
    reported_by     String DEFAULT '',
    confidence      Float32 DEFAULT 0,
    malware_family  String DEFAULT '',
    metadata        String DEFAULT '',
    timestamp       DateTime64(3) DEFAULT now64()
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (timestamp, source_country, dest_country)
TTL timestamp + INTERVAL 90 DAY
SETTINGS index_granularity = 8192
"""


class ClickHouseStorage:
    def __init__(self):
        self.client = None
        self._connected = False
        self._buffer: List[dict] = []
        self._buffer_limit = 50  # Flush after 50 events

    async def initialize(
        self,
        host: str = "clickhouse",
        port: int = 8123,
        database: str = "default",
    ):
        """Connect to ClickHouse and ensure the table exists."""
        if not HAS_CLICKHOUSE:
            logger.info("ClickHouse storage skipped (library not installed)")
            return

        try:
            self.client = clickhouse_connect.get_client(
                host=host,
                port=port,
                database=database,
            )
            # Verify connection
            result = self.client.command("SELECT 1")
            logger.info(f"ClickHouse connected: {host}:{port}")

            # Create table
            self.client.command(CREATE_TABLE_SQL)
            logger.info("ClickHouse table 'threat_events' ready")
            self._connected = True
        except Exception as e:
            logger.error(f"ClickHouse initialization failed: {e}")
            self._connected = False

    def store_event(self, event: Dict[str, Any]):
        """
        Buffer events and batch-insert into ClickHouse.
        Called from the pipeline after broadcast.
        """
        if not self._connected:
            return

        import json
        import uuid

        source = event.get("source", {})
        dest = event.get("dest", {})

        row = {
            "id": event.get("id", str(uuid.uuid4())),
            "source_kind": event.get("source_kind", "local_sensor"),
            "source_ip": source.get("query", ""),
            "source_lat": source.get("lat", 0),
            "source_lng": source.get("lng", 0),
            "source_country": source.get("country", "Unknown"),
            "dest_ip": dest.get("query", "") if dest else "",
            "dest_lat": dest.get("lat", 0) if dest else 0,
            "dest_lng": dest.get("lng", 0) if dest else 0,
            "dest_country": dest.get("country", "Unknown") if dest else "Unknown",
            "severity": event.get("severity", "low"),
            "event_type": event.get("type", ""),
            "reported_by": event.get("reported_by", ""),
            "confidence": event.get("confidence", 0),
            "malware_family": event.get("malware_family", ""),
            "metadata": json.dumps(event.get("metadata", {})),
            "timestamp": event.get("timestamp", datetime.utcnow().isoformat()),
        }

        self._buffer.append(row)

        if len(self._buffer) >= self._buffer_limit:
            self._flush()

    def _flush(self):
        """Batch-insert buffered events into ClickHouse."""
        if not self._connected or not self._buffer:
            return

        try:
            columns = list(self._buffer[0].keys())
            data = [list(row.values()) for row in self._buffer]
            self.client.insert(
                "threat_events",
                data,
                column_names=columns,
            )
            logger.debug(f"ClickHouse: inserted {len(self._buffer)} events")
            self._buffer.clear()
        except Exception as e:
            logger.error(f"ClickHouse insert failed: {e}")
            # Keep buffer for retry on next flush — but cap to avoid memory leak
            if len(self._buffer) > 500:
                self._buffer = self._buffer[-100:]

    def query_events(
        self,
        minutes: int = 60,
        source_country: Optional[str] = None,
        dest_country: Optional[str] = None,
        event_type: Optional[str] = None,
        limit: int = 1000,
    ) -> List[dict]:
        """Query historical events from ClickHouse."""
        if not self._connected:
            return []

        conditions = [
            f"timestamp >= now64() - INTERVAL {minutes} MINUTE"
        ]
        if source_country:
            conditions.append(f"source_country = '{source_country}'")
        if dest_country:
            conditions.append(f"dest_country = '{dest_country}'")
        if event_type:
            conditions.append(f"event_type = '{event_type}'")

        where = " AND ".join(conditions)
        query = f"""
            SELECT *
            FROM threat_events
            WHERE {where}
            ORDER BY timestamp DESC
            LIMIT {limit}
        """

        try:
            result = self.client.query(query)
            columns = result.column_names
            return [dict(zip(columns, row)) for row in result.result_rows]
        except Exception as e:
            logger.error(f"ClickHouse query failed: {e}")
            return []

    def get_stats(self, minutes: int = 60) -> dict:
        """Get aggregated attack statistics from ClickHouse."""
        if not self._connected:
            return {}

        try:
            result = self.client.query(f"""
                SELECT
                    count() as total_events,
                    countDistinct(source_country) as unique_sources,
                    countDistinct(dest_country) as unique_targets,
                    topK(10)(source_country) as top_source_countries,
                    topK(10)(dest_country) as top_target_countries,
                    topK(5)(event_type) as top_event_types
                FROM threat_events
                WHERE timestamp >= now64() - INTERVAL {minutes} MINUTE
            """)
            if result.result_rows:
                row = result.result_rows[0]
                columns = result.column_names
                return dict(zip(columns, row))
            return {}
        except Exception as e:
            logger.error(f"ClickHouse stats query failed: {e}")
            return {}

    def close(self):
        """Flush remaining buffer and close connection."""
        if self._buffer:
            self._flush()
        if self.client:
            self.client.close()
            logger.info("ClickHouse connection closed")


# Singleton
clickhouse_storage = ClickHouseStorage()
