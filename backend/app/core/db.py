from app.core.mongodb import mongodb_storage
import logging

logger = logging.getLogger("db")

def get_db():
    if mongodb_storage.db is None:
        logger.error("MongoDB is not initialized")
        raise RuntimeError("MongoDB is not initialized")
    return mongodb_storage.db
