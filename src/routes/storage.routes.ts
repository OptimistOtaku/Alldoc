import express from 'express';
import { authenticate } from '../middleware/auth.middleware';
import {
  listFiles,
  uploadFile,
  downloadFile,
  deleteFile,
  searchFiles,
  getStorageStats,
} from '../controllers/storage.controller';

const router = express.Router();

// All routes require authentication
router.use(authenticate);

// File operations
router.get('/files', listFiles);
router.post('/files/upload', uploadFile);
router.get('/files/:fileId/download', downloadFile);
router.delete('/files/:fileId', deleteFile);
router.get('/files/search', searchFiles);

// Storage analytics
router.get('/stats', getStorageStats);

export default router; 