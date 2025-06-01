import express from 'express';
import { googleAuth, googleCallback } from '../controllers/auth/google.controller';
import { dropboxAuth, dropboxCallback } from '../controllers/auth/dropbox.controller';
import { onedriveAuth, onedriveCallback } from '../controllers/auth/onedrive.controller';
import { register, login, logout } from '../controllers/auth/auth.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = express.Router();

// Local authentication routes
router.post('/register', register);
router.post('/login', login);
router.post('/logout', authenticate, logout);

// Google Drive OAuth routes
router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);

// Dropbox OAuth routes
router.get('/dropbox', authenticate, dropboxAuth);
router.get('/dropbox/callback', dropboxCallback);

// OneDrive OAuth routes
router.get('/onedrive', authenticate, onedriveAuth);
router.get('/onedrive/callback', onedriveCallback);

export default router; 