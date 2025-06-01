# Cloud Storage Aggregator

A unified cloud storage solution that aggregates free-tier storage from multiple cloud services (Google Drive, Dropbox, and OneDrive) into a single virtual drive.

## Features

- OAuth2 authentication with multiple cloud providers
- Unified file system interface
- Automatic file routing to services with most available space
- Cross-service file search
- Storage usage analytics
- Secure token management
- Rate limiting and error handling

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- OAuth2 credentials from:
  - Google Cloud Console
  - Dropbox Developer Console
  - Microsoft Azure Portal

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/cloud-storage-aggregator.git
cd cloud-storage-aggregator
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
# Server Configuration
PORT=3000
NODE_ENV=development

# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/cloud-storage-aggregator

# JWT Configuration
JWT_SECRET=your-jwt-secret-key
JWT_EXPIRATION=24h

# Google Drive API
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# Dropbox API
DROPBOX_CLIENT_ID=your-dropbox-client-id
DROPBOX_CLIENT_SECRET=your-dropbox-client-secret
DROPBOX_REDIRECT_URI=http://localhost:3000/auth/dropbox/callback

# OneDrive API
ONEDRIVE_CLIENT_ID=your-onedrive-client-id
ONEDRIVE_CLIENT_SECRET=your-onedrive-client-secret
ONEDRIVE_REDIRECT_URI=http://localhost:3000/auth/onedrive/callback

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

4. Build the project:
```bash
npm run build
```

5. Start the server:
```bash
npm start
```

For development:
```bash
npm run dev
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/google` - Initiate Google OAuth
- `GET /api/auth/google/callback` - Google OAuth callback
- `GET /api/auth/dropbox` - Initiate Dropbox OAuth
- `GET /api/auth/dropbox/callback` - Dropbox OAuth callback
- `GET /api/auth/onedrive` - Initiate OneDrive OAuth
- `GET /api/auth/onedrive/callback` - OneDrive OAuth callback

### Storage Operations
- `GET /api/storage/files` - List all files
- `POST /api/storage/files/upload` - Upload file
- `GET /api/storage/files/:fileId/download` - Download file
- `DELETE /api/storage/files/:fileId` - Delete file
- `GET /api/storage/files/search` - Search files
- `GET /api/storage/stats` - Get storage statistics

## Security

- All API endpoints (except registration and login) require JWT authentication
- OAuth2 tokens are securely stored in the database
- Rate limiting is implemented to prevent abuse
- Helmet.js is used for security headers
- CORS is properly configured

## Error Handling

The application implements a centralized error handling system that:
- Catches and processes all errors
- Provides meaningful error messages
- Logs errors for debugging
- Maintains security by not exposing sensitive information

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Google Drive API
- Dropbox API
- Microsoft Graph API
- Express.js
- MongoDB
- TypeScript 