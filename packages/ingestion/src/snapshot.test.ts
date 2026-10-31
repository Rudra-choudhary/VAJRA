import { describe, it, expect } from "vitest";
import {
  buildArtifactSnapshot,
  buildSourceSnapshot,
  truncateUtf8,
} from "./snapshot.js";
import { IngestionError } from "./errors.js";

describe("truncateUtf8", () => {
  it("does not truncate if buffer fits within maxBytes", () => {
    const buf = Buffer.from("hello world");
    const { buffer, truncated } = truncateUtf8(buf, 20);
    expect(truncated).toBe(false);
    expect(buffer.toString("utf8")).toBe("hello world");
  });

  it("truncates ASCII text without splitting words", () => {
    const buf = Buffer.from("hello world");
    const { buffer, truncated } = truncateUtf8(buf, 5);
    expect(truncated).toBe(true);
    expect(buffer.toString("utf8")).toBe("hello");
  });

  it("handles multibyte UTF-8 boundaries without splitting characters and walks back at most 3 bytes", () => {
    // 👋 is 4 bytes (F0 9F 91 8B)
    const buf = Buffer.from("hi 👋 there");
    // "hi " is 3 bytes. The emoji starts at index 3 and ends at index 6.

    // Cap at 4 bytes: cuts into emoji, so emoji should be omitted
    const cap4 = truncateUtf8(buf, 4);
    expect(cap4.truncated).toBe(true);
    expect(cap4.buffer.toString("utf8")).toBe("hi ");

    // Cap at 5 bytes: cuts into emoji, so emoji should be omitted
    const cap5 = truncateUtf8(buf, 5);
    expect(cap5.truncated).toBe(true);
    expect(cap5.buffer.toString("utf8")).toBe("hi ");

    // Cap at 6 bytes: cuts into emoji, so emoji should be omitted
    const cap6 = truncateUtf8(buf, 6);
    expect(cap6.truncated).toBe(true);
    expect(cap6.buffer.toString("utf8")).toBe("hi ");

    // Cap at 7 bytes: exactly encompasses "hi 👋" (3 + 4 = 7 bytes)
    const cap7 = truncateUtf8(buf, 7);
    expect(cap7.truncated).toBe(true);
    expect(cap7.buffer.toString("utf8")).toBe("hi 👋");
  });

  it("safely handles a buffer of only continuation bytes", () => {
    // Four continuation bytes (0x80)
    const onlyContinuation = Buffer.from([0x80, 0x80, 0x80, 0x80]);
    const { buffer, truncated } = truncateUtf8(onlyContinuation, 2);
    expect(truncated).toBe(true);
    // Walking back at most 3 bytes from 2 hits 0
    expect(buffer.length).toBe(0);
  });

  it("handles maxBytes edge cases: 0, negative, and NaN", () => {
    const buf = Buffer.from("hello world");
    const zero = truncateUtf8(buf, 0);
    expect(zero.truncated).toBe(true);
    expect(zero.buffer.length).toBe(0);

    const negative = truncateUtf8(buf, -5);
    expect(negative.truncated).toBe(true);
    expect(negative.buffer.length).toBe(0);

    const nan = truncateUtf8(buf, NaN);
    expect(nan.truncated).toBe(true);
    expect(nan.buffer.length).toBe(0);
  });
});

describe("Snapshot implementation", () => {
  it("different insertion order gives the same sha256 using code-unit ordering", () => {
    const map1 = new Map<string, Buffer>([
      ["src/index.js", Buffer.from("console.log('hi');\n")],
      ["package.json", Buffer.from('{"name":"test"}\n')],
      ["README.md", Buffer.from("# Test\n")],
    ]);

    const map2 = new Map<string, Buffer>([
      ["README.md", Buffer.from("# Test\n")],
      ["src/index.js", Buffer.from("console.log('hi');\n")],
      ["package.json", Buffer.from('{"name":"test"}\n')],
    ]);

    const snapshot1 = buildArtifactSnapshot(map1, { name: "test", version: "1.0.0" }, "package");
    const snapshot2 = buildArtifactSnapshot(map2, { name: "test", version: "1.0.0" }, "package");

    expect(snapshot1.sha256).toBe(snapshot2.sha256);
    // In code-unit ordering, 'R' (0x52) < 'p' (0x70) < 's' (0x73)
    expect(snapshot1.entries.map((e) => e.path)).toEqual([
      "README.md",
      "package.json",
      "src/index.js",
    ]);

    // Check immutability (frozen array and entries)
    expect(Object.isFrozen(snapshot1.entries)).toBe(true);
    expect(Object.isFrozen(snapshot1.entries[0])).toBe(true);
  });

  it("changing one byte changes the snapshot sha256", () => {
    const map1 = new Map<string, Buffer>([
      ["index.js", Buffer.from("export const x = 1;")],
    ]);
    const map2 = new Map<string, Buffer>([
      ["index.js", Buffer.from("export const x = 2;")],
    ]);

    const snapshot1 = buildSourceSnapshot(map1);
    const snapshot2 = buildSourceSnapshot(map2);

    expect(snapshot1.sha256).not.toBe(snapshot2.sha256);
  });

  it("excludes root and metadata from snapshot sha256", () => {
    const files = new Map<string, Buffer>([
      ["index.js", Buffer.from("export const x = 1;")],
    ]);

    const snapA = buildArtifactSnapshot(files, { name: "pkg-a", version: "1.0.0" }, "package");
    const snapB = buildArtifactSnapshot(files, { name: "pkg-b", version: "2.0.0" }, "");

    expect(snapA.sha256).toBe(snapB.sha256);
  });

  it("sizeBytes equals buffer length for a multibyte file", () => {
    const multibyteText = "🔥 Vajra ⚡";
    const buf = Buffer.from(multibyteText, "utf8");
    const files = new Map<string, Buffer>([["icon.txt", buf]]);

    const snapshot = buildSourceSnapshot(files);
    expect(snapshot.entries[0]!.sizeBytes).toBe(buf.length);
    expect(snapshot.entries[0]!.sizeBytes).toBeGreaterThan(multibyteText.length);
  });

  it("valid UTF-8 prefix followed by invalid bytes later is NOT binary when truncated before them", async () => {
    // 10 valid ASCII bytes followed by invalid non-UTF-8 bytes and null bytes
    const validPart = Buffer.from("0123456789");
    const invalidPart = Buffer.from([0xff, 0xfe, 0x00, 0x80]);
    const mixed = Buffer.concat([validPart, invalidPart]);

    const files = new Map<string, Buffer>([["mixed.txt", mixed]]);
    const snapshot = buildArtifactSnapshot(files, {}, "");

    // Reading with maxBytes = 10 reads only the valid UTF-8 prefix
    const res = await snapshot.readText("mixed.txt", 10);
    expect(res.binary).toBe(false);
    expect(res.truncated).toBe(true);
    expect(res.text).toBe("0123456789");

    // Reading with maxBytes = 20 includes the invalid/null bytes and should be identified as binary
    const fullRes = await snapshot.readText("mixed.txt", 20);
    expect(fullRes.binary).toBe(true);
    expect(fullRes.text).toBeNull();
  });

  it("returns text null for a file of only continuation bytes and never empty text with binary: false", async () => {
    const onlyContinuation = Buffer.from([0x80, 0x81, 0x82, 0x83]);
    const files = new Map<string, Buffer>([["invalid.txt", onlyContinuation]]);
    const snapshot = buildSourceSnapshot(files);

    // Full read (not truncated)
    const resFull = await snapshot.readText("invalid.txt", 1024);
    expect(resFull.binary).toBe(true);
    expect(resFull.text).toBeNull();

    // Truncated read (maxBytes = 2)
    const resTrunc = await snapshot.readText("invalid.txt", 2);
    expect(resTrunc.binary).toBe(true);
    expect(resTrunc.text).toBeNull();
    expect(resTrunc.truncated).toBe(true);
  });

  it("readText handles maxBytes edge cases: 0, negative, and NaN", async () => {
    const files = new Map<string, Buffer>([["file.txt", Buffer.from("hello world")]]);
    const snapshot = buildSourceSnapshot(files);

    const resZero = await snapshot.readText("file.txt", 0);
    expect(resZero.binary).toBe(false);
    expect(resZero.text).toBe("");
    expect(resZero.truncated).toBe(true);

    const resNeg = await snapshot.readText("file.txt", -10);
    expect(resNeg.binary).toBe(false);
    expect(resNeg.text).toBe("");
    expect(resNeg.truncated).toBe(true);

    const resNan = await snapshot.readText("file.txt", NaN);
    expect(resNan.binary).toBe(false);
    expect(resNan.text).toBe("");
    expect(resNan.truncated).toBe(true);
  });

  it("abort throws an AbortError and not an IngestionError", async () => {
    const files = new Map<string, Buffer>([["file.txt", Buffer.from("content")]]);
    const snapshot = buildArtifactSnapshot(files, {}, "");

    const controller = new AbortController();
    controller.abort();

    await expect(
      snapshot.readText("file.txt", 1024, controller.signal),
    ).rejects.toSatisfy((err) => {
      // Must NOT be IngestionError
      expect(err).not.toBeInstanceOf(IngestionError);
      // Must be an AbortError DOMException
      expect(err).toBeInstanceOf(DOMException);
      expect((err as DOMException).name).toBe("AbortError");
      return true;
    });
  });

  it("rethrows signal.reason directly if it is an Error", async () => {
    const files = new Map<string, Buffer>([["file.txt", Buffer.from("content")]]);
    const snapshot = buildArtifactSnapshot(files, {}, "");

    const customError = new TypeError("Custom abort reason");
    const controller = new AbortController();
    controller.abort(customError);

    await expect(
      snapshot.readText("file.txt", 1024, controller.signal),
    ).rejects.toBe(customError);
  });
});
