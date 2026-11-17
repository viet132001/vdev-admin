import React from 'react';
import { avatarSrc } from '../services/avatar';
import { initials } from './userInitials';

// Avatar image when the user has one (R2 public URL), otherwise initials
export const UserAvatar: React.FC<{ user: { fullName: string; email: string; avatarFileId: string | null } }> = ({ user }) => {
  const src = avatarSrc(user.avatarFileId);
  return src
    ? <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
    : <>{initials(user.fullName, user.email)}</>;
};
