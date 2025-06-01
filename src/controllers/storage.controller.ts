import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { Dropbox } from 'dropbox';
import { Client } from '@microsoft/microsoft-graph-client';
import { User } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// List files across all connected cloud services
export const listFiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const files = [];
    for (const service of user.cloudServices) {
      switch (service.provider) {
        case 'google':
          const drive = google.drive({ version: 'v3', auth: service.accessToken });
          const googleFiles = await drive.files.list({
            fields: 'files(id, name, size, mimeType, createdTime)',
          });
          files.push(...googleFiles.data.files!.map(file => ({
            ...file,
            provider: 'google',
          })));
          break;

        case 'dropbox':
          const dbx = new Dropbox({ accessToken: service.accessToken });
          const dropboxFiles = await dbx.filesListFolder({ path: '' });
          files.push(...dropboxFiles.result.entries.map(file => ({
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.mime_type,
            createdTime: file.server_modified,
            provider: 'dropbox',
          })));
          break;

        case 'onedrive':
          const client = Client.init({
            authProvider: (done) => {
              done(null, service.accessToken);
            },
          });
          const onedriveFiles = await client
            .api('/me/drive/root/children')
            .get();
          files.push(...onedriveFiles.value.map(file => ({
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.file?.mimeType,
            createdTime: file.createdDateTime,
            provider: 'onedrive',
          })));
          break;
      }
    }

    res.json({ files });
  } catch (error) {
    logger.error('List files error:', error);
    next(error);
  }
};

// Upload file to the service with most available space
export const uploadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    // Find service with most available space
    const service = user.cloudServices.reduce((prev, current) => {
      const prevAvailable = prev.storageLimit - prev.storageUsed;
      const currentAvailable = current.storageLimit - current.storageUsed;
      return currentAvailable > prevAvailable ? current : prev;
    });

    if (!service) {
      throw new AppError('No cloud service connected', 400);
    }

    let fileId;
    switch (service.provider) {
      case 'google':
        const drive = google.drive({ version: 'v3', auth: service.accessToken });
        const file = await drive.files.create({
          requestBody: {
            name: req.file.originalname,
            mimeType: req.file.mimetype,
          },
          media: {
            mimeType: req.file.mimetype,
            body: req.file.buffer,
          },
        });
        fileId = file.data.id;
        break;

      case 'dropbox':
        const dbx = new Dropbox({ accessToken: service.accessToken });
        const result = await dbx.filesUpload({
          path: `/${req.file.originalname}`,
          contents: req.file.buffer,
        });
        fileId = result.result.id;
        break;

      case 'onedrive':
        const client = Client.init({
          authProvider: (done) => {
            done(null, service.accessToken);
          },
        });
        const response = await client
          .api('/me/drive/root:/' + req.file.originalname + ':/content')
          .put(req.file.buffer);
        fileId = response.id;
        break;
    }

    // Update storage usage
    service.storageUsed += req.file.size;
    await user.save();

    res.json({
      message: 'File uploaded successfully',
      fileId,
      provider: service.provider,
    });
  } catch (error) {
    logger.error('Upload file error:', error);
    next(error);
  }
};

// Download file from specific service
export const downloadFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileId } = req.params;
    const { provider } = req.query;

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const service = user.cloudServices.find(s => s.provider === provider);
    if (!service) {
      throw new AppError('Cloud service not connected', 400);
    }

    let fileData;
    switch (service.provider) {
      case 'google':
        const drive = google.drive({ version: 'v3', auth: service.accessToken });
        const response = await drive.files.get(
          { fileId, alt: 'media' },
          { responseType: 'stream' }
        );
        fileData = response.data;
        break;

      case 'dropbox':
        const dbx = new Dropbox({ accessToken: service.accessToken });
        const result = await dbx.filesDownload({ path: fileId });
        fileData = result.result.fileBinary;
        break;

      case 'onedrive':
        const client = Client.init({
          authProvider: (done) => {
            done(null, service.accessToken);
          },
        });
        const download = await client
          .api(`/me/drive/items/${fileId}/content`)
          .get();
        fileData = download;
        break;
    }

    res.json({ fileData });
  } catch (error) {
    logger.error('Download file error:', error);
    next(error);
  }
};

// Delete file from specific service
export const deleteFile = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { fileId } = req.params;
    const { provider } = req.query;

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const service = user.cloudServices.find(s => s.provider === provider);
    if (!service) {
      throw new AppError('Cloud service not connected', 400);
    }

    switch (service.provider) {
      case 'google':
        const drive = google.drive({ version: 'v3', auth: service.accessToken });
        await drive.files.delete({ fileId });
        break;

      case 'dropbox':
        const dbx = new Dropbox({ accessToken: service.accessToken });
        await dbx.filesDelete({ path: fileId });
        break;

      case 'onedrive':
        const client = Client.init({
          authProvider: (done) => {
            done(null, service.accessToken);
          },
        });
        await client.api(`/me/drive/items/${fileId}`).delete();
        break;
    }

    res.json({ message: 'File deleted successfully' });
  } catch (error) {
    logger.error('Delete file error:', error);
    next(error);
  }
};

// Search files across all services
export const searchFiles = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { query } = req.query;
    if (!query) {
      throw new AppError('Search query required', 400);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const results = [];
    for (const service of user.cloudServices) {
      switch (service.provider) {
        case 'google':
          const drive = google.drive({ version: 'v3', auth: service.accessToken });
          const googleResults = await drive.files.list({
            q: `name contains '${query}'`,
            fields: 'files(id, name, size, mimeType, createdTime)',
          });
          results.push(...googleResults.data.files!.map(file => ({
            ...file,
            provider: 'google',
          })));
          break;

        case 'dropbox':
          const dbx = new Dropbox({ accessToken: service.accessToken });
          const dropboxResults = await dbx.filesSearch({
            query: query as string,
          });
          results.push(...dropboxResults.result.matches.map(match => ({
            id: match.metadata.id,
            name: match.metadata.name,
            size: match.metadata.size,
            mimeType: match.metadata.mime_type,
            createdTime: match.metadata.server_modified,
            provider: 'dropbox',
          })));
          break;

        case 'onedrive':
          const client = Client.init({
            authProvider: (done) => {
              done(null, service.accessToken);
            },
          });
          const onedriveResults = await client
            .api('/me/drive/root/search(q=\'' + query + '\')')
            .get();
          results.push(...onedriveResults.value.map(file => ({
            id: file.id,
            name: file.name,
            size: file.size,
            mimeType: file.file?.mimeType,
            createdTime: file.createdDateTime,
            provider: 'onedrive',
          })));
          break;
      }
    }

    res.json({ results });
  } catch (error) {
    logger.error('Search files error:', error);
    next(error);
  }
};

// Get storage statistics
export const getStorageStats = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const stats = user.cloudServices.map(service => ({
      provider: service.provider,
      used: service.storageUsed,
      limit: service.storageLimit,
      available: service.storageLimit - service.storageUsed,
      percentage: (service.storageUsed / service.storageLimit) * 100,
    }));

    res.json({ stats });
  } catch (error) {
    logger.error('Get storage stats error:', error);
    next(error);
  }
}; 