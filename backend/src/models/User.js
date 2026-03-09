import mongoose from 'mongoose';

// Basic user account used for authentication and notifications.
// Users sign in with a username and password. Email is kept for
// scan notifications and contact, but is not used as the login key.
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true },
  email: { type: String, required: false, unique: true, sparse: true, index: true },
  passwordHash: { type: String, required: true },
  name: { type: String, required: false, default: '' },
  roles: { type: [String], default: ['user'] },

  totpEnabled: { type: Boolean, default: false },
  totpSecret: { type: String, default: '' },
  totpTempSecret: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.model('User', userSchema);