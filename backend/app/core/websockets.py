import logging
from collections import defaultdict
from fastapi import WebSocket

logger = logging.getLogger(__name__)

# Maximum concurrent WebSocket connections per user
MAX_CONNECTIONS_PER_USER = 5

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []
        # Track connections per username for rate-limiting
        self._user_connections: dict[str, list[WebSocket]] = defaultdict(list)

    def user_connection_count(self, username: str) -> int:
        """Return current active connection count for a user."""
        # Clean up stale references
        self._user_connections[username] = [
            ws for ws in self._user_connections[username]
            if ws in self.active_connections
        ]
        return len(self._user_connections[username])

    def can_connect(self, username: str) -> bool:
        """Check if a user is under the per-user connection limit."""
        return self.user_connection_count(username) < MAX_CONNECTIONS_PER_USER

    async def connect(self, websocket: WebSocket, username: str = "anonymous"):
        """Accept and track a WebSocket connection for a specific user."""
        await websocket.accept()
        self.active_connections.append(websocket)
        self._user_connections[username].append(websocket)
        logger.info(
            f"[WS] User '{username}' connected. "
            f"User connections: {self.user_connection_count(username)}, "
            f"Total connections: {len(self.active_connections)}"
        )

    def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection from all tracking structures."""
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        # Remove from per-user tracking
        for username, connections in self._user_connections.items():
            if websocket in connections:
                connections.remove(websocket)
                logger.info(
                    f"[WS] User '{username}' disconnected. "
                    f"Remaining: {len(connections)}"
                )
                break

    async def send_personal_message(self, message: str, websocket: WebSocket):
        await websocket.send_text(message)

    async def broadcast(self, message: str):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_text(message)
            except Exception as e:
                logger.warning(f"Error broadcasting to client: {e}")
                disconnected.append(connection)
        # Clean up dead connections
        for ws in disconnected:
            self.disconnect(ws)

manager = ConnectionManager()
