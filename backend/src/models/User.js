import mongoose from 'mongoose';

// Basic user account used for authentication and notifications.
// Users sign in with a username and password. Email is required so users can
// recover access via password reset.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: true, trim: true, lowercase: true },
  emailAlertsEnabled: { type: Boolean, default: false },
  passwordHash: { type: String, required: true },
  passwordResetCodeHash: { type: String, default: undefined },
  passwordResetExpiresAt: { type: Date, default: undefined },
  roles: { type: [String], default: ['user'] },
}, { timestamps: true });

// Keep the partial unique index to avoid duplicate key errors for any legacy users
// that may still have a missing email value in older databases.
userSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: {
      email: { $type: 'string' },
    },
  },
);

export default mongoose.model('User', userSchema);