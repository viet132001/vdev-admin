// Turns a lesson's video link into something playable. Only http(s) links ever reach an iframe, <video> or href.

export type VideoSource =
  | { kind: 'embed'; url: string }
  | { kind: 'file'; url: string }
  | { kind: 'link'; url: string; site?: 'facebook' };

const FILE_EXTENSION = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;
// Generated videos live in VDEV storage, whose links have no file extension
const STORAGE_FILE = /^\/api\/storage\/files\/[\w-]+\/download$/;
const YOUTUBE_ID = /^[\w-]{6,}$/;

const youtubeId = (url: URL, host: string) => {
  if (host === 'youtu.be') return url.pathname.split('/')[1];
  if (host !== 'youtube.com' && host !== 'm.youtube.com' && host !== 'youtube-nocookie.com') return null;
  if (url.pathname === '/watch') return url.searchParams.get('v');
  const [, prefix, id] = url.pathname.split('/');
  return ['embed', 'shorts', 'live', 'v'].includes(prefix) ? id : null;
};

// Facebook's player refuses this channel's Reels outside Facebook ("Bạn không thể nhúng video này") even though the
// Graph API calls them embeddable, so a Facebook link opens on Facebook instead of showing a broken player
const FACEBOOK_HOSTS = ['facebook.com', 'm.facebook.com', 'web.facebook.com', 'fb.watch'];

export const parseVideo = (raw: string | null | undefined): VideoSource | null => {
  let url: URL;
  try {
    url = new URL((raw || '').trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const host = url.hostname.replace(/^www\./, '');
  const id = youtubeId(url, host);
  if (id && YOUTUBE_ID.test(id)) return { kind: 'embed', url: `https://www.youtube-nocookie.com/embed/${id}` };

  if (FACEBOOK_HOSTS.includes(host)) return { kind: 'link', url: url.href, site: 'facebook' };

  const drive = host === 'drive.google.com' && url.pathname.match(/^\/file\/d\/([\w-]+)/);
  if (drive) return { kind: 'embed', url: `https://drive.google.com/file/d/${drive[1]}/preview` };

  if (FILE_EXTENSION.test(url.pathname) || STORAGE_FILE.test(url.pathname)) return { kind: 'file', url: url.href };
  return { kind: 'link', url: url.href };
};
