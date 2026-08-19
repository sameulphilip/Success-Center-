import { BadRequestException } from '@nestjs/common';
import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';

const MAX_BYTES = 5 * 1024 * 1024;

function uploadsRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
}

export function proofAbsolutePath(relative: string) {
  const root = path.resolve(uploadsRoot());
  const abs = path.resolve(root, relative);
  if (!abs.startsWith(root + path.sep) && abs !== root) {
    throw new BadRequestException('مسار الصورة غير صالح');
  }
  return abs;
}

function sniffImage(buf: Buffer): { ext: 'jpg' | 'png' | 'webp'; mime: string } | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { ext: 'jpg', mime: 'image/jpeg' };
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return { ext: 'png', mime: 'image/png' };
  }
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { ext: 'webp', mime: 'image/webp' };
  }
  return null;
}

export function decodeProofDataUrl(raw?: string | null): Buffer | null {
  const value = (raw || '').trim();
  if (!value) return null;
  const match = value.match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
  const b64 = match ? match[2].replace(/\s/g, '') : value.replace(/^data:[^;]+;base64,/i, '');
  if (!b64 || b64.length > MAX_BYTES * 1.4) {
    throw new BadRequestException('صورة التحويل كبيرة جدًا (الحد 5 ميجا)');
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(b64, 'base64');
  } catch {
    throw new BadRequestException('صورة التحويل غير صالحة');
  }
  if (!buf.length) return null;
  if (buf.length > MAX_BYTES) {
    throw new BadRequestException('صورة التحويل كبيرة جدًا (الحد 5 ميجا)');
  }
  if (!sniffImage(buf)) {
    throw new BadRequestException('ارفع صورة JPG أو PNG أو WebP');
  }
  return buf;
}

export async function saveBookingProof(submissionId: string, buf: Buffer) {
  const kind = sniffImage(buf);
  if (!kind) throw new BadRequestException('ارفع صورة JPG أو PNG أو WebP');
  const rel = path.join('booking-proofs', `${submissionId}.${kind.ext}`);
  const abs = proofAbsolutePath(rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, buf);
  return { relativePath: rel.replace(/\\/g, '/'), mime: kind.mime };
}

export async function readBookingProof(relativePath: string) {
  const abs = proofAbsolutePath(relativePath);
  const buf = await readFile(abs);
  const kind = sniffImage(buf);
  return {
    buffer: buf,
    mime: kind?.mime || 'application/octet-stream',
    filename: path.basename(abs),
  };
}
