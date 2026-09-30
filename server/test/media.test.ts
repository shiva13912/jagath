import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api, createEvent, createUser, jpegBuffer, pool, setupDb } from './helpers.js';

type U = Awaited<ReturnType<typeof createUser>>;
let admin: U, member: U, other: U;
const YEAR = 2035;
let albumId: number;

/** JPEG with GPS EXIF, as phones produce. */
async function jpegWithGps() {
  return sharp({ create: { width: 1200, height: 900, channels: 3, background: '#335577' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '17/1 23/1 0/1' } })
    .toBuffer();
}

beforeAll(async () => {
  await setupDb();
  admin = await createUser('admin');
  member = await createUser('member');
  other = await createUser('member');
  await createEvent(admin, YEAR, { isPublished: true });
});
afterAll(() => pool.end());

describe('albums', () => {
  it('members can create albums; the public cannot list team album endpoints', async () => {
    const res = await api().post(`/api/events/${YEAR}/albums`).set('Cookie', member.cookie).send({ name: 'Decoration' });
    expect(res.status).toBe(201);
    albumId = res.body.album.id;
    expect((await api().get(`/api/events/${YEAR}/albums`)).status).toBe(401);
  });
  it('album names are unique per year', async () => {
    expect((await api().post(`/api/events/${YEAR}/albums`).set('Cookie', admin.cookie).send({ name: 'decoration' })).status).toBe(409);
  });
  it('only admins change album visibility', async () => {
    expect((await api().put(`/api/albums/${albumId}`).set('Cookie', member.cookie).send({ isPublic: false })).status).toBe(403);
  });
});

describe('uploads and visibility', () => {
  let memberPhoto: number;
  let adminPhoto: number;

  it('member uploads several photos; they await approval and get thumbnails', async () => {
    const res = await api()
      .post(`/api/albums/${albumId}/media`)
      .set('Cookie', member.cookie)
      .attach('files', await jpegWithGps(), 'IMG_1.jpg')
      .attach('files', await jpegBuffer(), 'IMG_2.jpg');
    expect(res.status).toBe(201);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.published).toBe(false);
    expect(res.body.items[0]).toMatchObject({ type: 'photo', is_public: false, has_thumb: true, width: 1200, height: 900 });
    memberPhoto = res.body.items[0].id;
  });

  it('strips GPS/EXIF metadata from stored photos', async () => {
    const res = await api().get(`/api/media/${memberPhoto}/file`).set('Cookie', member.cookie).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = [];
      r.on('data', (c: Buffer) => chunks.push(c));
      r.on('end', () => cb(null, Buffer.concat(chunks)));
    });
    expect(res.status).toBe(200);
    const meta = await sharp(res.body as Buffer).metadata();
    expect(meta.exif).toBeUndefined();
  });

  it('unapproved media is invisible to the public (404, not 403)', async () => {
    expect((await api().get(`/api/media/${memberPhoto}/file`)).status).toBe(404);
    expect((await api().get(`/api/media/${memberPhoto}/thumb`)).status).toBe(404);
  });

  it('admin uploads are published immediately and publicly viewable', async () => {
    const res = await api().post(`/api/albums/${albumId}/media`).set('Cookie', admin.cookie).attach('files', await jpegBuffer(), 'main.jpg');
    expect(res.body.published).toBe(true);
    adminPhoto = res.body.items[0].id;
    const pub = await api().get(`/api/media/${adminPhoto}/thumb`);
    expect(pub.status).toBe(200);
    expect(pub.headers['content-type']).toBe('image/webp');
  });

  it('members cannot publish; admins can approve in bulk', async () => {
    expect((await api().put(`/api/media/${memberPhoto}`).set('Cookie', member.cookie).send({ isPublic: true })).status).toBe(403);
    expect((await api().post('/api/media/bulk').set('Cookie', member.cookie).send({ ids: [memberPhoto], action: 'publish' })).status).toBe(403);
    expect((await api().post('/api/media/bulk').set('Cookie', admin.cookie).send({ ids: [memberPhoto], action: 'publish' })).status).toBe(200);
    expect((await api().get(`/api/media/${memberPhoto}/file`)).status).toBe(200);
  });

  it('hiding the album or unpublishing the year hides its media instantly', async () => {
    await api().put(`/api/albums/${albumId}`).set('Cookie', admin.cookie).send({ isPublic: false }).expect(200);
    expect((await api().get(`/api/media/${adminPhoto}/file`)).status).toBe(404);
    await api().put(`/api/albums/${albumId}`).set('Cookie', admin.cookie).send({ isPublic: true }).expect(200);
    await api().put(`/api/events/${YEAR}`).set('Cookie', admin.cookie).send({ isPublished: false }).expect(200);
    expect((await api().get(`/api/media/${adminPhoto}/file`)).status).toBe(404);
    // The team still sees it.
    expect((await api().get(`/api/media/${adminPhoto}/file`).set('Cookie', other.cookie)).status).toBe(200);
    await api().put(`/api/events/${YEAR}`).set('Cookie', admin.cookie).send({ isPublished: true }).expect(200);
  });

  it('public download honours allow_download', async () => {
    await api().put(`/api/media/${adminPhoto}`).set('Cookie', admin.cookie).send({ allowDownload: false }).expect(200);
    expect((await api().get(`/api/media/${adminPhoto}/file?download=1`)).status).toBe(403);
    await api().put(`/api/media/${adminPhoto}`).set('Cookie', admin.cookie).send({ allowDownload: true }).expect(200);
    const dl = await api().get(`/api/media/${adminPhoto}/file?download=1`);
    expect(dl.status).toBe(200);
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
  });

  it('accepts videos by content and rejects disguised files', async () => {
    // Minimal MP4 "ftyp" header is enough for type detection.
    const mp4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.from([0, 0, 0, 0]), Buffer.from('mp42isom'), Buffer.alloc(64)]);
    const ok = await api().post(`/api/albums/${albumId}/media`).set('Cookie', member.cookie).attach('files', mp4, 'clip.mp4');
    expect(ok.status).toBe(201);
    expect(ok.body.items[0]).toMatchObject({ type: 'video', mime_type: 'video/mp4', has_thumb: false });
    const bad = await api().post(`/api/albums/${albumId}/media`).set('Cookie', member.cookie).attach('files', Buffer.from('MZ fake exe'), 'photo.jpg');
    expect(bad.status).toBe(400);
  });

  it("members delete only their own uploads", async () => {
    expect((await api().delete(`/api/media/${adminPhoto}`).set('Cookie', member.cookie)).status).toBe(403);
    expect((await api().delete(`/api/media/${memberPhoto}`).set('Cookie', other.cookie)).status).toBe(403);
    expect((await api().delete(`/api/media/${memberPhoto}`).set('Cookie', member.cookie)).status).toBe(200);
    expect((await api().get(`/api/media/${memberPhoto}/file`).set('Cookie', admin.cookie)).status).toBe(404);
  });
});
