// Where to land after login (e.g. back to an invite link). sessionStorage survives the Google
// redirect in the same tab; only in-app paths are accepted so it can't become an open redirect.
const KEY = 'vdev_after_login';

export const setAfterLogin = (path: string) => {
  if (path.startsWith('/') && !path.startsWith('//')) sessionStorage.setItem(KEY, path);
};

export const takeAfterLogin = (): string => {
  const path = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  return path && path.startsWith('/') && !path.startsWith('//') ? path : '/';
};
