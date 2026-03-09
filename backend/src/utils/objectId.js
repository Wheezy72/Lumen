import mongoose from 'mongoose';

export function isValidObjectId(value) {
  if (typeof value !== 'string') return false;
  if (!/^[0-9a-fA-F]{24}$/.test(value)) return false;
  return mongoose.Types.ObjectId.isValid(value);
}
