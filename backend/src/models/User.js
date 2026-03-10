import mongoose from 'mongoose';

// Basic user account used for authentication and notifications.
// Users sign in with a username and password. Email is optional and is only
// used for notifications when the user enables email alerts.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: false, default: undefined, trim: true, lowercase: true },
  emailAlertsEnabled: { type: Boolean, default: false },
  passwordHash: { type: String, required: true },
  name: { type: String, required: false, default: '' },
  roles: { type: [String], default: ['user'] },
}, { timestamps: true });

// Email must be unique only when it exists (prevents duplicate key errors for null/missing values).
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