declare module 'dropbox' {
  import { files } from 'dropbox/types/dropbox_types';

  interface FileMetadataReference {
    id: string;
    name: string;
    size: number;
    mime_type: string;
    server_modified: string;
  }

  interface FolderMetadataReference {
    id: string;
    name: string;
    path_display: string;
  }

  interface DeletedMetadataReference {
    name: string;
    path_display: string;
  }

  type MetadataReference = FileMetadataReference | FolderMetadataReference | DeletedMetadataReference;

  export class Dropbox {
    constructor(options: { clientId?: string; clientSecret?: string; accessToken?: string });
    
    filesListFolder(arg: { path: string }): Promise<{
      result: {
        entries: files.MetadataReference[];
      };
    }>;

    filesUpload(arg: {
      path: string;
      contents: Buffer;
    }): Promise<{
      result: files.FileMetadata;
    }>;

    filesDownload(arg: {
      path: string;
    }): Promise<{
      result: files.FileMetadata & {
        fileBinary: ArrayBuffer;
      };
    }>;

    filesDelete(arg: {
      path: string;
    }): Promise<void>;

    filesGetMetadata(arg: {
      path: string;
    }): Promise<{
      result: files.MetadataReference;
    }>;

    filesSearch(arg: {
      path: string;
      query: string;
    }): Promise<{
      result: {
        matches: Array<{
          metadata: files.MetadataReference;
        }>;
      };
    }>;

    getAuthenticationUrl(redirectUri: string, state: string | null, authType: string): Promise<string>;
    getAccessTokenFromCode(redirectUri: string, code: string): Promise<{ result: { access_token: string; refresh_token: string; expires_in: number } }>;
    checkUser(options: { accessToken: string }): Promise<{ result: { allocation: { allocated: number } } }>;
  }

  export { files };
} 