import { Request, Response, NextFunction } from 'express';
import { Client } from '@microsoft/microsoft-graph-client';
import { User } from '../../models/user.model';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';

const client = Client.init({
  authProvider: (done) => {
    done(null, process.env.ONEDRIVE_CLIENT_ID!);
  },
});

export const onedriveAuth = async (req: Request, res: Response) => {
  try {
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${process.env.ONEDRIVE_CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${process.env.ONEDRIVE_REDIRECT_URI}` +
      `&scope=offline_access%20files.readwrite` +
      `&response_mode=query`;

    res.json({ authUrl });
  } catch (error) {
    logger.error('OneDrive auth error:', error);
    throw new AppError('Failed to initiate OneDrive authentication', 500);
  }
};

export const onedriveCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new AppError('Authorization code not provided', 400);
    }

    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: process.env.ONEDRIVE_CLIENT_ID!,
        client_secret: process.env.ONEDRIVE_CLIENT_SECRET!,
        code: code as string,
        redirect_uri: process.env.ONEDRIVE_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenResponse.json();

    // Get drive info
    const drive = await client
      .api('/me/drive')
      .get();

    // Update user's OneDrive tokens
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const onedriveService = user.cloudServices.find(
      (service) => service.provider === 'onedrive'
    );

    if (onedriveService) {
      onedriveService.accessToken = tokens.access_token;
      onedriveService.refreshToken = tokens.refresh_token;
      onedriveService.tokenExpiry = new Date(Date.now() + tokens.expires_in * 1000);
      onedriveService.storageLimit = drive.quota.total;
    } else {
      user.cloudServices.push({
        provider: 'onedrive',
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: new Date(Date.now() + tokens.expires_in * 1000),
        storageLimit: drive.quota.total,
        storageUsed: 0,
      });
    }

    await user.save();
    res.json({ message: 'OneDrive connected successfully' });
  } catch (error) {
    logger.error('OneDrive callback error:', error);
    next(error);
  }
}; 