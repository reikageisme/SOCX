from pymongo import MongoClient
import gridfs
import logging

logger = logging.getLogger("mongodb")

class MongoDBStorage:
    def __init__(self):
        self.client = None
        self.db = None
        self.fs = None

    def initialize(self, uri: str = "mongodb://mongodb:27017/", db_name: str = "aegis_fs"):
        try:
            self.client = MongoClient(uri, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            self.db = self.client[db_name]
            self.fs = gridfs.GridFS(self.db)
            logger.info("MongoDB and GridFS initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize MongoDB: {e}")
            self.client = None
            self.db = None
            self.fs = None

    def close(self):
        if self.client:
            self.client.close()
            logger.info("MongoDB connection closed")

mongodb_storage = MongoDBStorage()
