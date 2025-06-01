import mongoose, { Document, Schema } from 'mongoose';

interface ICloudService {
  provider: 'google' | 'dropbox' | 'onedrive';
  accessToken: string;
  refreshToken: string;
  tokenExpiry: Date;
  storageUsed: number;
  storageLimit: number;
}

interface IUser extends Document {
  email: string;
  password: string;
  name: string;
  cloudServices: ICloudService[];
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    cloudServices: [{
      provider: {
        type: String,
        enum: ['google', 'dropbox', 'onedrive'],
        required: true,
      },
      accessToken: {
        type: String,
        required: true,
      },
      refreshToken: {
        type: String,
        required: true,
      },
      tokenExpiry: {
        type: Date,
        required: true,
      },
      storageUsed: {
        type: Number,
        default: 0,
      },
      storageLimit: {
        type: Number,
        required: true,
      },
    }],
  },
  {
    timestamps: true,
  }
);

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ 'cloudServices.provider': 1 });

export const User = mongoose.model<IUser>('User', userSchema); 