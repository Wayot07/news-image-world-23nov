// Entry program for the make.fun news-image-20261123 bounty.
// It copies the pre-drawn front page (entry.png, next to this file)
// into the output directory as entry.png. Node 22 standard library
// only; no network, no dependencies, fully deterministic.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_IEND = Buffer.from("IEND");
const MAX_BYTES = 1048576;

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function looksLikePng(bytes: Buffer): boolean {
  if (bytes.length < PNG_MAGIC.length) return false;
  return bytes.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
}

function hasIendTrailer(bytes: Buffer): boolean {
  // A whole PNG ends with the 12-byte IEND chunk: length 0, "IEND", CRC.
  if (bytes.length < 12) return false;
  const tail = bytes.subarray(bytes.length - 12);
  return tail.readUInt32BE(0) === 0 && tail.subarray(4, 8).equals(PNG_IEND);
}

function readPngSize(bytes: Buffer): { width: number; height: number } {
  // IHDR chunk: 8-byte signature, 4-byte length, 4-byte "IHDR",
  // then width (4 bytes BE) and height (4 bytes BE).
  if (bytes.length < 24 || !bytes.subarray(12, 16).equals(Buffer.from("IHDR"))) {
    fail("source image has no IHDR chunk where one is expected");
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}
function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = join(here, "entry.png");
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const target = join(outDir, "entry.png");

  if (!existsSync(source)) fail(`source image missing: ${source}`);
  const sourceBytes = readFileSync(source);
  if (!looksLikePng(sourceBytes)) fail("source image is not a PNG (bad magic bytes)");
  if (!hasIendTrailer(sourceBytes)) fail("source image is truncated (no IEND trailer)");
  if (sourceBytes.length > MAX_BYTES) {
    fail(`source image is ${sourceBytes.length} bytes, over the 1 MiB limit`);
  }
  const size = readPngSize(sourceBytes);
  if (size.width > 1024 || size.height > 1024) {
    fail(`source image is ${size.width}x${size.height}, over the 1024x1024 limit`);
  }

  mkdirSync(outDir, { recursive: true });
  copyFileSync(source, target);

  const copiedBytes = readFileSync(target);
  if (!looksLikePng(copiedBytes)) fail("copied image is not a PNG (bad magic bytes)");
  if (!hasIendTrailer(copiedBytes)) fail("copied image is truncated (no IEND trailer)");
  if (!copiedBytes.equals(sourceBytes)) fail("copied image differs from the source image");
  const copiedSize = statSync(target).size;
  if (copiedSize !== sourceBytes.length) {
    fail(`copied size ${copiedSize} does not match source size ${sourceBytes.length}`);
  }

  console.log(`wrote ${target} (${copiedSize} bytes, sha256 ${sha256(copiedBytes)})`);
}

main();
