import { Request, Response, NextFunction } from 'express';
import { google } from 'googleapis';
import { Dropbox, files } from 'dropbox';
import { Client } from '@microsoft/microsoft-graph-client';
import { User } from '../models/user.model';
import { AppError } from '../middleware/error.middleware';
import { logger } from '../utils/logger';

// Type definitions
interface OneDriveFile {
  id: string;
  name: string;
  size: number;
  file: {
    mimeType: string;
  };
  createdDateTime: string;
}

interface UploadedFile {
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

interface FileMetadataReference {
  '.tag': 'file';
  id: string;
  name: string;
  size: number;
  mime_type?: string;
  server_modified: string;
}

interface FolderMetadataReference {
  '.tag': 'folder';
  id: string;
  name: string;
  path_display: string;
}

interface DeletedMetadataReference {
  '.tag': 'deleted';
  name: string;
  path_display: string;
}

type MetadataReference = FileMetadataReference | FolderMetadataReference | DeletedMetadataReference;

// Type guard functions
function isFileMetadata(metadata: any): metadata is files.FileMetadata {
  return metadata && metadata['.tag'] === 'file' && 'id' in metadata && 'size' in metadata && 'server_modified' in metadata;
}

function isFolderMetadata(metadata: MetadataReference): metadata is FolderMetadataReference {
  return metadata['.tag'] === 'folder';
}

function isDeletedMetadata(metadata: MetadataReference): metadata is DeletedMetadataReference {
  return metadata['.tag'] === 'deleted';
}

function isOneDriveFile(file: any): file is OneDriveFile {
  return file && 'id' in file && 'name' in file && 'size' in file && 'file' in file;
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      file?: UploadedFile;
    }
  }
}

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

    const files: any[] = [];

    // Google Drive files
    const googleService = user.cloudServices.find(s => s.provider === 'google');
    if (googleService?.accessToken) {
      const drive = google.drive({ version: 'v3', auth: googleService.accessToken });
      const response = await drive.files.list({
        pageSize: 100,
        fields: 'files(id, name, size, mimeType, createdTime)',
      });

      files.push(...response.data.files!.map((file: any) => ({
        provider: 'google',
        id: file.id,
        name: file.name,
        size: Number(file.size) || 0,
        mimeType: file.mimeType,
        createdTime: file.createdTime,
      })));
    }

    // Dropbox files
    const dropboxService = user.cloudServices.find(s => s.provider === 'dropbox');
    if (dropboxService?.accessToken) {
      const dbx = new Dropbox({ 
        clientId: process.env.DROPBOX_CLIENT_ID || '',
        clientSecret: process.env.DROPBOX_CLIENT_SECRET || '',
        accessToken: dropboxService.accessToken 
      });
      const response = await dbx.filesListFolder({ path: '' });
      
      const dropboxFiles = (response.result.entries.filter(isFileMetadata) as unknown) as files.FileMetadata[];
      files.push(...dropboxFiles.map(file => ({
        provider: 'dropbox',
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: 'mime_type' in file ? file.mime_type : 'application/octet-stream',
        createdTime: file.server_modified,
      })));
    }

    // OneDrive files
    const onedriveService = user.cloudServices.find(s => s.provider === 'onedrive');
    if (onedriveService?.accessToken) {
      const client = Client.init({
        authProvider: (done) => done(null, onedriveService.accessToken),
      });

      const onedriveFiles = await client
        .api('/me/drive/root/children')
        .select('id,name,size,file,createdDateTime')
        .get();

      files.push(...onedriveFiles.value
        .filter(isOneDriveFile)
        .map((file: OneDriveFile) => ({
          provider: 'onedrive',
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.file.mimeType,
          createdTime: file.createdDateTime,
        })));
    }

    res.json(files);
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
    if (!req.file) {
      throw new AppError('No file uploaded', 400);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    // Find service with most available space
    const service = user.cloudServices.reduce((best, current) => {
      const bestAvailable = best.storageLimit - best.storageUsed;
      const currentAvailable = current.storageLimit - current.storageUsed;
      return currentAvailable > bestAvailable ? current : best;
    });

    if (!service) {
      throw new AppError('No cloud storage service available', 400);
    }

    if (service.storageUsed + req.file.size > service.storageLimit) {
      throw new AppError('Insufficient storage space', 400);
    }

    let uploadedFile;

    switch (service.provider) {
      case 'google':
        const drive = google.drive({ version: 'v3', auth: service.accessToken });
        uploadedFile = await drive.files.create({
          requestBody: {
            name: req.file.originalname,
            mimeType: req.file.mimetype,
          },
          media: {
            mimeType: req.file.mimetype,
            body: req.file.buffer,
          },
        });
        break;

      case 'dropbox':
        const dbx = new Dropbox({ accessToken: service.accessToken });
        uploadedFile = await dbx.filesUpload({
          path: `/${req.file.originalname}`,
          contents: req.file.buffer,
        });
        break;

      case 'onedrive':
        const client = Client.init({
          authProvider: (done) => done(null, service.accessToken),
        });
        uploadedFile = await client
          .api('/me/drive/root:/' + req.file.originalname + ':/content')
          .put(req.file.buffer);
        break;

      default:
        throw new AppError('Unsupported cloud storage provider', 400);
    }

    service.storageUsed += req.file.size;
    await user.save();

    res.json({
      message: 'File uploaded successfully',
      file: uploadedFile,
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
    const { provider, fileId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const service = user.cloudServices.find(s => s.provider === provider);
    if (!service) {
      throw new AppError('Cloud storage service not found', 404);
    }

    let fileData: Buffer;
    let fileName: string;
    let mimeType: string;

    switch (provider) {
      case 'google':
        const drive = google.drive({ version: 'v3', auth: service.accessToken });
        const file = await drive.files.get({ fileId, fields: 'name,mimeType' });
        const response = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'arraybuffer' });
        fileData = Buffer.from(response.data as ArrayBuffer);
        fileName = file.data.name!;
        mimeType = file.data.mimeType!;
        break;

      case 'dropbox':
        const dbx = new Dropbox({ accessToken: service.accessToken });
        const result = await dbx.filesDownload({ path: fileId });
        const fileMeta = result.result as any;
        fileData = Buffer.from(fileMeta.fileBinary);
        fileName = fileMeta.name;
        mimeType = fileMeta.mime_type || 'application/octet-stream';
        break;

      case 'onedrive':
        const client = Client.init({
          authProvider: (done) => done(null, service.accessToken),
        });
        const onedriveFile = await client
          .api(`/me/drive/items/${fileId}`)
          .select('name,file')
          .get();
        const content = await client
          .api(`/me/drive/items/${fileId}/content`)
          .get();
        fileData = Buffer.from(content);
        fileName = onedriveFile.name;
        mimeType = onedriveFile.file.mimeType;
        break;

      default:
        throw new AppError('Unsupported cloud storage provider', 400);
    }

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(fileData);
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
    const { provider, fileId } = req.params;
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const service = user.cloudServices.find(s => s.provider === provider);
    if (!service) {
      throw new AppError('Cloud storage service not found', 404);
    }

    let fileSize = 0;

    switch (provider) {
      case 'google':
        const drive = google.drive({ version: 'v3', auth: service.accessToken });
        const file = await drive.files.get({ fileId, fields: 'size' });
        fileSize = Number(file.data.size) || 0;
        await drive.files.delete({ fileId });
        break;

      case 'dropbox':
        const dbx = new Dropbox({ accessToken: service.accessToken });
        const metadata = await dbx.filesGetMetadata({ path: fileId });
        if (isFileMetadata(metadata.result)) {
          fileSize = ((metadata.result as unknown) as files.FileMetadata).size;
        }
        await dbx.filesDelete({ path: fileId });
        break;

      case 'onedrive':
        const client = Client.init({
          authProvider: (done) => done(null, service.accessToken),
        });
        const onedriveFile = await client
          .api(`/me/drive/items/${fileId}`)
          .select('size')
          .get();
        fileSize = onedriveFile.size;
        await client
          .api(`/me/drive/items/${fileId}`)
          .delete();
        break;

      default:
        throw new AppError('Unsupported cloud storage provider', 400);
    }

    service.storageUsed = Math.max(0, service.storageUsed - fileSize);
    await user.save();

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
      throw new AppError('Search query is required', 400);
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const results: any[] = [];

    // Google Drive search
    const googleService = user.cloudServices.find(s => s.provider === 'google');
    if (googleService?.accessToken) {
      const drive = google.drive({ version: 'v3', auth: googleService.accessToken });
      const response = await drive.files.list({
        q: `name contains '${query}'`,
        fields: 'files(id, name, size, mimeType, createdTime)',
      });

      results.push(...response.data.files!.map(file => ({
        provider: 'google',
        id: file.id,
        name: file.name,
        size: Number(file.size) || 0,
        mimeType: file.mimeType,
        createdTime: file.createdTime,
      })));
    }

    // Dropbox search
    const dropboxService = user.cloudServices.find(s => s.provider === 'dropbox');
    if (dropboxService?.accessToken) {
      const dbx = new Dropbox({ accessToken: dropboxService.accessToken });
      const dropboxResults = await dbx.filesSearch({
        path: '',
        query: query as string,
      });

      const dropboxMatches = (dropboxResults.result.matches
        .map(match => match.metadata)
        .filter(isFileMetadata) as unknown) as files.FileMetadata[];
      results.push(...dropboxMatches.map(file => ({
        provider: 'dropbox',
        id: file.id,
        name: file.name,
        size: file.size,
        mimeType: 'mime_type' in file ? file.mime_type : 'application/octet-stream',
        createdTime: file.server_modified,
      })));
    }

    // OneDrive search
    const onedriveService = user.cloudServices.find(s => s.provider === 'onedrive');
    if (onedriveService?.accessToken) {
      const client = Client.init({
        authProvider: (done) => done(null, onedriveService.accessToken),
      });

      const onedriveResults = await client
        .api('/me/drive/root/search(q=\'' + query + '\')')
        .select('id,name,size,file,createdDateTime')
        .get();

      results.push(...onedriveResults.value
        .filter(isOneDriveFile)
        .map((file: OneDriveFile) => ({
          provider: 'onedrive',
          id: file.id,
          name: file.name,
          size: file.size,
          mimeType: file.file.mimeType,
          createdTime: file.createdDateTime,
        })));
    }

    res.json(results);
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