import { pool } from '../../config/db';

export type MediaStatus = 'uploading' | 'processing' | 'ready' | 'failed';
export interface MediaRecord {
  id: string;
  ownerId: string;
  key: string;
  filename: string;
  contentType: string;
  status: MediaStatus;
}

const toRecord = (r: Record<string, string>): MediaRecord => ({
  id: r.id, ownerId: r.owner_id, key: r.key, filename: r.filename, contentType: r.content_type, status: r.status as MediaStatus,
});

export async function insertMedia(m: MediaRecord): Promise<void> {
  await pool.query(
    'INSERT INTO media (id, owner_id, key, filename, content_type, status) VALUES ($1, $2, $3, $4, $5, $6)',
    [m.id, m.ownerId, m.key, m.filename, m.contentType, m.status],
  );
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  const { rows } = await pool.query('SELECT * FROM media WHERE id = $1', [id]);
  return rows[0] ? toRecord(rows[0]) : null;
}

export async function updateMedia(id: string, patch: { status?: MediaStatus; key?: string; contentType?: string }): Promise<void> {
  const cur = await getMedia(id);
  if (!cur) return;
  await pool.query('UPDATE media SET status = $1, key = $2, content_type = $3 WHERE id = $4', [
    patch.status ?? cur.status, patch.key ?? cur.key, patch.contentType ?? cur.contentType, id,
  ]);
}
