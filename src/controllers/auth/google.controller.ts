import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { User } from '../../models/user.model';
import { AppError } from '../../middleware/error.middleware';
import { logger } from '../../utils/logger';

// Initialize OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export const googleAuth = async (req: Request, res: Response) => {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) {
      throw new AppError('Google Drive integration is not configured. Please check your environment variables.', 500);
    }

    const scopes = [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
      include_granted_scopes: true
    });

    res.redirect(authUrl);
  } catch (error) {
    logger.error('Google auth error:', error);
    throw new AppError('Failed to initiate Google authentication', 500);
  }
};

export const googleCallback = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { code } = req.query;
    if (!code) {
      throw new AppError('Authorization code not provided', 400);
    }

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // Get user info
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const userInfo = await oauth2.userinfo.get();

    // Get drive info
    const drive = google.drive({ version: 'v3', auth: oauth2Client });
    const about = await drive.about.get({ fields: 'storageQuota' });

    // Find or create user
    let user = await User.findOne({ email: userInfo.data.email });
    if (!user) {
      user = await User.create({
        email: userInfo.data.email,
        name: userInfo.data.name || userInfo.data.email,
        password: Math.random().toString(36).slice(-8), // Generate random password
        cloudServices: []
      });
    }

    // Update user's Google Drive tokens
    const googleService = user.cloudServices.find(
      (service) => service.provider === 'google'
    );

    if (googleService) {
      googleService.accessToken = tokens.access_token!;
      googleService.refreshToken = tokens.refresh_token!;
      googleService.tokenExpiry = new Date(tokens.expiry_date!);
      googleService.storageLimit = Number(about.data.storageQuota?.limit) || 0;
    } else {
      user.cloudServices.push({
        provider: 'google',
        accessToken: tokens.access_token!,
        refreshToken: tokens.refresh_token!,
        tokenExpiry: new Date(tokens.expiry_date!),
        storageLimit: Number(about.data.storageQuota?.limit) || 0,
        storageUsed: 0,
      });
    }

    await user.save();

    // Redirect to frontend with success message
    res.redirect('/?message=Google Drive connected successfully');
  } catch (error) {
    logger.error('Google callback error:', error);
    res.redirect('/?error=Failed to connect Google Drive');
  }
}; 