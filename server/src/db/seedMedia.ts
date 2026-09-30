import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { storage } from '../services/storage/index.js';
import { pool } from './pool.js';
import type { Ids } from './seed.js';

/**
 * Albums with generated placeholder "photos" (festive gradients with a label)
 * and, if an ffmpeg binary is available, a few short sample videos.
 * Nothing here is a real photo of a real person.
 */
const ALBUMS: Array<[string, string, string[]]> = [
  ['Preparation', 'Setting up the pandal and getting ready', ['#f5b82e', '#e0971b']],
  ['Decoration', 'Flowers, lights and the pandal', ['#cc3a33', '#f5b82e']],
  ['Main Event', 'Pooja and the main celebration days', ['#9f1d20', '#e0971b']],
  ['Procession', 'Vijayadashami procession', ['#7c181b', '#eb6834']],
  ['Closing', 'Thanks to everyone who made it happen', ['#5e1416', '#c07214']],
] as unknown as Array<[string, string, string[]]>;

const tmp = path.join(os.tmpdir(), 'durgamatha-seed-media');

function scene(label: string, sub: string, [a, b]: string[], seed: number, w = 1600, h = 1067) {
  const rnd = (n: number) => ((Math.sin(seed * 9301 + n * 49297) + 1) / 2);
  const lamps = Array.from({ length: 14 }, (_, i) => {
    const x = Math.round(rnd(i) * w), y = Math.round(rnd(i + 50) * h * 0.55), r = Math.round(8 + rnd(i + 99) * 26);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff3c4" opacity="${(0.25 + rnd(i + 7) * 0.5).toFixed(2)}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="#fff7d6" stop-opacity="0.9"/><stop offset="1" stop-color="#fff7d6" stop-opacity="0"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/>${lamps}
    <circle cx="${w / 2}" cy="${h * 0.45}" r="${h * 0.33}" fill="url(#glow)"/>
    <g transform="translate(${w / 2} ${h * 0.45})" fill="none" stroke="#7c181b" stroke-width="10" opacity="0.8">
      <circle r="${h * 0.14}"/><circle r="${h * 0.06}" fill="#f5b82e"/>
      ${Array.from({ length: 12 }, (_, i) => `<line x1="0" y1="${-h * 0.16}" x2="0" y2="${-h * 0.22}" transform="rotate(${i * 30})"/>`).join('')}
    </g>
    <path d="M0 ${h} L0 ${h * 0.82} Q ${w / 2} ${h * 0.68} ${w} ${h * 0.82} L${w} ${h} Z" fill="#1f1a17" opacity="0.55"/>
    <text x="${w / 2}" y="${h * 0.9}" text-anchor="middle" font-family="Georgia, serif" font-size="${h * 0.06}" fill="#fff">${label}</text>
    <text x="${w / 2}" y="${h * 0.96}" text-anchor="middle" font-family="sans-serif" font-size="${h * 0.028}" fill="#fff" opacity="0.8">${sub} · sample image</text>
  </svg>`;
}

function findFfmpeg(): string | null {
  const candidates = [process.env.FFMPEG_PATH, '/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux'];
  return candidates.find((c) => c && fs.existsSync(c)) ?? null;
}

/** Encodes a 4 second 640x360 WebM from generated JPEG frames (written to one file, then encoded). */
async function sampleVideo(ffmpeg: string, label: string, colors: string[], out: string): Promise<boolean> {
  const frames = `${out}.mjpeg`;
  const parts: Buffer[] = [];
  for (let f = 0; f < 48; f++) {
    parts.push(await sharp(Buffer.from(scene(label, `frame ${f + 1}`, colors, f / 6, 640, 360))).jpeg({ quality: 70 }).toBuffer());
  }
  fs.writeFileSync(frames, Buffer.concat(parts));
  const proc = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '12', '-c:v', 'mjpeg', '-i', frames, '-c:v', 'libvpx', '-b:v', '600k', '-pix_fmt', 'yuv420p', out], { stdio: 'ignore' });
  return new Promise<boolean>((resolve) => {
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0 && fs.existsSync(out)));
  });
}

export async function seedMedia(ids: Ids, eventIds: Record<number, number>) {
  fs.mkdirSync(tmp, { recursive: true });
  const uploaders = [ids.Ravi!, ids.Priya!, ids.Shiva!, ids.Anil!, ids.Deepa!];
  const ffmpeg = findFfmpeg();
  let n = 0;
  for (const [yearStr, eventId] of Object.entries(eventIds)) {
    const year = Number(yearStr);
    const current = year === 2026;
    const albums = current ? ALBUMS.slice(0, 2) : ALBUMS;
    for (const [ai, [name, desc, colors]] of albums.entries()) {
      const { rows } = await pool.query(
        `INSERT INTO albums (event_id, name, description, is_public, sort_order, created_by) VALUES ($1,$2,$3,TRUE,$4,$5) RETURNING id`,
        [eventId, name, desc, ai + 1, ids.Anil],
      );
      const albumId = rows[0].id;
      const count = current ? 5 : 4;
      for (let i = 0; i < count; i++) {
        n++;
        const uuid = crypto.randomUUID();
        const src = path.join(tmp, `${uuid}.jpg`);
        const thumb = path.join(tmp, `${uuid}.webp`);
        const img = sharp(Buffer.from(scene(`${name} ${year}`, `Photo ${i + 1}`, colors, n)));
        await img.clone().jpeg({ quality: 82 }).toFile(src);
        await img.clone().resize(640).webp({ quality: 70 }).toFile(thumb);
        const key = `events/${year}/media/${uuid}.jpg`;
        const thumbKey = `events/${year}/thumbs/${uuid}.webp`;
        await storage.put(key, src, 'image/jpeg');
        await storage.put(thumbKey, thumb, 'image/webp');
        const uploader = uploaders[(n + i) % uploaders.length]!;
        const pending = current && i === count - 1; // a couple awaiting approval
        await pool.query(
          `INSERT INTO media (event_id, album_id, type, storage_key, thumb_key, original_name, mime_type, size_bytes, width, height, description, is_public, is_featured, uploaded_by, created_at)
           VALUES ($1,$2,'photo',$3,$4,$5,'image/jpeg',$6,1600,1067,$7,$8,$9,$10,$11)`,
          [eventId, albumId, key, thumbKey, `IMG_${year}_${String(n).padStart(4, '0')}.jpg`, fs.statSync(src).size,
            i === 0 ? `${name}, ${year}` : null, !pending, i === 0 && (name === 'Main Event' || name === 'Decoration'), uploader,
            `${year}-${current ? '09-2' + (i % 8) : '10-0' + (i + 2)}T18:00:00+05:30`],
        );
      }
      if (ffmpeg && (name === 'Procession' || (current && name === 'Decoration'))) {
        const out = path.join(tmp, `${crypto.randomUUID()}.webm`);
        if (await sampleVideo(ffmpeg, `${name} ${year}`, colors, out)) {
          const key = `events/${year}/media/${crypto.randomUUID()}.webm`;
          await storage.put(key, out, 'video/webm');
          await pool.query(
            `INSERT INTO media (event_id, album_id, type, storage_key, original_name, mime_type, size_bytes, width, height, description, is_public, is_featured, uploaded_by)
             VALUES ($1,$2,'video',$3,$4,'video/webm',$5,640,360,$6,TRUE,$7,$8)`,
            [eventId, albumId, key, `${name.toLowerCase()}-${year}.webm`, fs.statSync(out).size, `${name} highlights ${year}`, name === 'Procession', ids.Shiva],
          );
        }
      }
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!ffmpeg) console.log('ffmpeg not found: skipped sample videos (set FFMPEG_PATH to include them).');
}
