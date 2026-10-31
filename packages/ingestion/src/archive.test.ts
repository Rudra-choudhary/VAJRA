import { describe, it, expect } from "vitest";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { Header } from "tar";
import { parseTarGzStream } from "./archive.js";
import { calculateMaxHeaders } from "./limits.js";

const FIXTURES_DIR = join(process.cwd(), "tests/fixtures/ingestion");

function makeRawV7Header(name: string, size: number): Buffer {
  const block = Buffer.alloc(512);
  block.write(name, 0, 100, "ascii");
  block.write("0000644\0", 100, 8, "ascii");
  block.write("0000000\0", 108, 8, "ascii");
  block.write("0000000\0", 116, 8, "ascii");
  block.write(size.toString(8).padStart(11, "0") + "\0", 124, 12, "ascii");
  block.write(Math.floor(Date.now() / 1000).toString(8).padStart(11, "0") + "\0", 136, 12, "ascii");
  block[156] = 0; // Explicit raw NUL typeflag byte
  block.fill(32, 148, 156); // 8 spaces for checksum calculation
  let sum = 0;
  for (let i = 0; i < 512; i++) sum += block[i]!;
  block.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return block;
}

describe("calculateMaxHeaders", () => {
  it("guards against NaN, 0, negative values, and non-integers", () => {
    expect(calculateMaxHeaders(NaN)).toBe(1000);
    expect(calculateMaxHeaders(0)).toBe(1000);
    expect(calculateMaxHeaders(-50)).toBe(1000);
    expect(calculateMaxHeaders(-Infinity)).toBe(1000);
    expect(calculateMaxHeaders(Infinity)).toBe(1000);
    expect(calculateMaxHeaders(10)).toBe(1000); // 2 * 10 = 20 < 1000 floor
    expect(calculateMaxHeaders(600)).toBe(1200); // 2 * 600 = 1200 > 1000 floor
  });
});

describe("parseTarGzStream", () => {
  it("parses valid archive into Map<string, Buffer>", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "good.tgz"));
    const entries = await parseTarGzStream(stream, { maxEntries: 100 });

    expect(entries.size).toBe(2);
    expect(entries.has("package/package.json")).toBe(true);
    expect(entries.has("package/index.js")).toBe(true);

    const manifest = JSON.parse(entries.get("package/package.json")!.toString("utf8"));
    expect(manifest.name).toBe("demo");
    expect(manifest.version).toBe("1.0.0");
  });

  it("accepts hand-crafted raw 512-byte V7 header with NUL typeflag byte", async () => {
    const content = Buffer.from("hand-crafted raw V7 legacy file\n");
    const headerBlock = makeRawV7Header("package/legacy_raw.txt", content.length);

    const rem = content.length % 512;
    const pad = rem === 0 ? Buffer.alloc(0) : Buffer.alloc(512 - rem);
    const tarBytes = Buffer.concat([headerBlock, content, pad, Buffer.alloc(1024)]);
    const tgz = gzipSync(tarBytes);

    const entries = await parseTarGzStream(Readable.from(tgz), { maxEntries: 100 });
    expect(entries.has("package/legacy_raw.txt")).toBe(true);
    expect(entries.get("package/legacy_raw.txt")!.toString("utf8")).toBe(
      "hand-crafted raw V7 legacy file\n",
    );
  });

  it("rejects ContiguousFile and GNUDumpDir with UNSAFE_ARCHIVE_ENTRY", async () => {
    for (const type of ["ContiguousFile", "GNUDumpDir"] as const) {
      const h = new Header({
        path: "package/special.dat",
        type,
        size: 0,
      });
      h.encode();
      const tarBytes = Buffer.concat([h.block, Buffer.alloc(1024)]);
      const tgz = gzipSync(tarBytes);

      await expect(
        parseTarGzStream(Readable.from(tgz), { maxEntries: 100 }),
      ).rejects.toMatchObject({
        code: "UNSAFE_ARCHIVE_ENTRY",
      });
    }
  });

  it("enforces exact header cap boundary: exactly 1000 headers passes, 1001 fails", async () => {
    // For maxEntries: 10, calculateMaxHeaders(10) is 1000.
    // 1. Build an archive with 999 directory headers + 1 file header = exactly 1000 headers
    const blocks1000: Buffer[] = [];
    for (let i = 0; i < 999; i++) {
      const h = new Header({ path: `d${i}/`, type: "Directory", size: 0 });
      h.encode();
      blocks1000.push(h.block);
    }
    const fileHeader = new Header({ path: "file.txt", type: "File", size: 4 });
    fileHeader.encode();
    blocks1000.push(fileHeader.block);
    blocks1000.push(Buffer.from("test"));
    blocks1000.push(Buffer.alloc(512 - 4));
    blocks1000.push(Buffer.alloc(1024));
    const tgz1000 = gzipSync(Buffer.concat(blocks1000));

    const res1000 = await parseTarGzStream(Readable.from(tgz1000), { maxEntries: 10 });
    expect(res1000.size).toBe(1);
    expect(res1000.has("file.txt")).toBe(true);

    // 2. Build an archive with 1000 directory headers + 1 file header = exactly 1001 headers
    const blocks1001: Buffer[] = [];
    for (let i = 0; i < 1000; i++) {
      const h = new Header({ path: `d${i}/`, type: "Directory", size: 0 });
      h.encode();
      blocks1001.push(h.block);
    }
    blocks1001.push(fileHeader.block);
    blocks1001.push(Buffer.from("test"));
    blocks1001.push(Buffer.alloc(512 - 4));
    blocks1001.push(Buffer.alloc(1024));
    const tgz1001 = gzipSync(Buffer.concat(blocks1001));

    await expect(
      parseTarGzStream(Readable.from(tgz1001), { maxEntries: 10 }),
    ).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT_EXCEEDED",
    });
  });

  it("rejects GNU long link / PAX header traversal path with UNSAFE_ARCHIVE_ENTRY", async () => {
    // A GNU LongLink header (type 'NextFileHasLongPath' / 'L') specifying an escaped traversal path
    const longPath = "../escape.js\0";
    const longPathBuf = Buffer.alloc(512);
    longPathBuf.write(longPath, "ascii");

    const longLinkHeader = new Header({
      path: "././@LongLink",
      type: "NextFileHasLongPath",
      size: longPath.length,
    });
    longLinkHeader.encode();

    const fileHeader = new Header({
      path: "package/safe.js",
      type: "File",
      size: 0,
    });
    fileHeader.encode();

    const tarBytes = Buffer.concat([
      longLinkHeader.block,
      longPathBuf,
      fileHeader.block,
      Buffer.alloc(1024),
    ]);
    const tgz = gzipSync(tarBytes);

    await expect(
      parseTarGzStream(Readable.from(tgz), { maxEntries: 100 }),
    ).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("rejects path traversal with UNSAFE_ARCHIVE_ENTRY", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "traversal.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("rejects absolute paths with UNSAFE_ARCHIVE_ENTRY", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "absolute.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("rejects symbolic links with UNSAFE_ARCHIVE_ENTRY", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "symlink.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("rejects hard links with UNSAFE_ARCHIVE_ENTRY", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "hardlink.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("rejects duplicate or case-colliding entries with UNSAFE_ARCHIVE_ENTRY", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "duplicate.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "UNSAFE_ARCHIVE_ENTRY",
    });
  });

  it("rejects oversized entry exceeding 5 MiB with ARCHIVE_LIMIT_EXCEEDED", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "oversized_entry.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT_EXCEEDED",
    });
  });

  it("rejects entries count exceeding context.limits.maxEntries with ARCHIVE_LIMIT_EXCEEDED", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "too_many_entries.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 5 })).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT_EXCEEDED",
    });
  });

  it("rejects high compression expansion bomb with ARCHIVE_LIMIT_EXCEEDED", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "bomb.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "ARCHIVE_LIMIT_EXCEEDED",
    });
  });

  it("rejects corrupt non-gzip stream with INVALID_ARCHIVE", async () => {
    const stream = createReadStream(join(FIXTURES_DIR, "corrupt.tgz"));
    await expect(parseTarGzStream(stream, { maxEntries: 100 })).rejects.toMatchObject({
      code: "INVALID_ARCHIVE",
    });
  });

  it("honors AbortSignal and destroys stream", async () => {
    const controller = new AbortController();
    const stream = createReadStream(join(FIXTURES_DIR, "good.tgz"));
    controller.abort();

    await expect(
      parseTarGzStream(stream, { maxEntries: 100, signal: controller.signal }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});
