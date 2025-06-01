import { Request, Response, NextFunction } from 'express';
import { Dropbox } from 'dropbox';
import { User } from '../../models/user.model';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';

// Initialize Dropbox client only if credentials are available
const dbx = process.env.DROPBOX_CLIENT_ID && process.env.DROPBOX_CLIENT_SECRET
  ? new Dropbox({
      clientId: process.env.DROPBOX_CLIENT_ID,
      clientSecret: process.env.DROPBOX_CLIENT_SECRET,
    })
  : null;

export const dropboxAuth = async (req: Request, res: Response) => {
  try {
    if (!process.env.DROPBOX_CLIENT_ID || !process.env.DROPBOX_REDIRECT_URI) {
      throw new AppError('Dropbox integration is not configured. Please check your environment variables.', 500);
    }

    const authUrl = `https://www.dropbox.com/oauth2/authorize?` +
      `client_id=${process.env.DROPBOX_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${process.env.DROPBOX_REDIRECT_URI}` +
      `&token_access_type=offline`;

    res.json({ authUrl });
  } catch (error) {
    logger.error('Dropbox auth error:', error);
    throw new AppError('Failed to initiate Dropbox authentication', 500);
  }
};

export const dropboxCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!process.env.DROPBOX_CLIENT_ID || !process.env.DROPBOX_CLIENT_SECRET || !process.env.DROPBOX_REDIRECT_URI) {
      throw new AppError('Dropbox integration is not configured. Please check your environment variables.', 500);
    }

    const { code } = req.query;
    if (!code) {
      throw new AppError('Authorization code not provided', 400);
    }

    const tokenResponse = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code: code as string,
        grant_type: 'authorization_code',
        client_id: process.env.DROPBOX_CLIENT_ID,
        client_secret: process.env.DROPBOX_CLIENT_SECRET,
        redirect_uri: process.env.DROPBOX_REDIRECT_URI,
      }),
    });

    const tokens = await tokenResponse.json();

    // Get account info
    const accountResponse = await fetch('https://api.dropboxapi.com/2/users/get_space_usage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    const account = await accountResponse.json();

    // Update user's Dropbox tokens
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const dropboxService = user.cloudServices.find(
      (service) => service.provider === 'dropbox'
    );

    if (dropboxService) {
      dropboxService.accessToken = tokens.access_token;
      dropboxService.refreshToken = tokens.refresh_token;
      dropboxService.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      dropboxService.storageLimit = account.allocation.allocated;
    } else {
      user.cloudServices.push({
        provider: 'dropbox',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        storageLimit: account.allocation.allocated,
        storageUsed: 0,
      });
    }

    await user.save();
    res.json({ message: 'Dropbox connected successfully' });
  } catch (error) {
    logger.error('Dropbox callback error:', error);
    next(error);
  }
}; 