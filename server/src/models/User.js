import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long']
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    passwordHash: {
      type: String,
      required: [true, 'Password hash is required']
    },
    settings: {
      alertAfterSeconds: {
        type: Number,
        default: 20,
        min: 5,
        max: 120
      },
      breakEveryMinutes: {
        type: Number,
        default: 45,
        min: 15,
        max: 180
      }
    }
  },
  {
    timestamps: true
  }
);

// Method to return safe public profile without sensitive hash
userSchema.methods.toSafeObject = function () {
  return {
    id: this._id.toString(),
    name: this.name,
    email: this.email,
    settings: this.settings,
    createdAt: this.createdAt
  };
};

export const User = mongoose.model('User', userSchema);
