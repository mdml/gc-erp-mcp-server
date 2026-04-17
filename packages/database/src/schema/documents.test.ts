import { describe, expect, it } from "vitest";
import { Document, documentIdFor } from "./documents";

const SHA = "a".repeat(64);

describe("Document Zod", () => {
  const base = {
    id: `doc_${SHA}`,
    sha256: SHA,
    mimeType: "application/pdf",
    originalFilename: "LY-7791.pdf",
    sizeBytes: 12_345,
    uploadedAt: "2026-05-04T10:00:00Z",
  };

  it("defaults tags to []", () => {
    const parsed = Document.parse(base);
    expect(parsed.tags).toEqual([]);
  });

  it("round-trips with optional fields and tags", () => {
    const full = {
      ...base,
      uploadedBy: "party_me",
      jobId: "job_kitchen",
      tags: ["invoice", "lumber"],
    };
    expect(Document.parse(full)).toEqual(full);
  });

  it("rejects a malformed sha256", () => {
    expect(() => Document.parse({ ...base, sha256: "not-a-sha" })).toThrow();
    expect(() => Document.parse({ ...base, sha256: "A".repeat(64) })).toThrow(); // uppercase
  });

  it("rejects a negative sizeBytes", () => {
    expect(() => Document.parse({ ...base, sizeBytes: -1 })).toThrow();
  });
});

describe("documentIdFor", () => {
  it("produces doc_<sha256> for valid input", () => {
    expect(documentIdFor(SHA)).toBe(`doc_${SHA}`);
  });

  it("throws on malformed sha256", () => {
    expect(() => documentIdFor("xyz")).toThrow();
    expect(() => documentIdFor("A".repeat(64))).toThrow();
  });
});
