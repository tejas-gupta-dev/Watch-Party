/**
 * What the room is watching.
 *  - youtube: played through the YouTube IFrame API
 *  - file:    a movie uploaded to object storage, streamed through a signed URL
 *  - local:   every member opens the same file from their own disk (nothing is uploaded)
 */
export type Source =
  | { type: 'youtube'; videoId: string; title?: string }
  | { type: 'file'; mediaId: string; title?: string }
  | { type: 'local'; filename: string; size: number; title?: string };

export type SourceType = Source['type'];

const YT_ID = /^[\w-]{11}$/;

/** Accepts a full YouTube URL (watch, youtu.be, shorts, embed) or a bare 11-char id. */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (YT_ID.test(value)) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\.|^m\./, '');
    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('/')[0];
      return YT_ID.test(id) ? id : null;
    }
    if (host === 'youtube.com' || host === 'music.youtube.com') {
      const v = url.searchParams.get('v');
      if (v && YT_ID.test(v)) return v;
      const m = url.pathname.match(/^\/(?:embed|shorts|live)\/([\w-]{11})/);
      if (m) return m[1];
    }
  } catch {
    /* not a URL */
  }
  return null;
}
