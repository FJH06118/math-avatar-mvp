import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/mock/voices/[voiceId]/preview/route";

const voiceIds = ["voice-qinghe", "voice-zhiyuan", "voice-mingxi"] as const;

describe("voice preview fixtures", () => {
  it("routes every supported voice and rate to its own real MP3", async () => {
    const hashes = new Set<string>();
    for (const voiceId of voiceIds) {
      const response = await GET(
        new Request(`http://localhost/api/mock/voices/${voiceId}/preview?rate=1.25`),
        { params: Promise.resolve({ voiceId }) },
      );
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toBe(
        `http://localhost/audio/voice-previews/${voiceId}.mp3`,
      );

      const bytes = await readFile(
        join(process.cwd(), "public", "audio", "voice-previews", `${voiceId}.mp3`),
      );
      expect(bytes.byteLength).toBeGreaterThan(20_000);
      hashes.add(createHash("sha256").update(bytes).digest("hex"));
    }
    expect(hashes.size).toBe(3);
  });

  it("rejects unknown voices and out-of-range rates", async () => {
    const unknownVoice = await GET(
      new Request("http://localhost/api/mock/voices/voice-unknown/preview?rate=1"),
      { params: Promise.resolve({ voiceId: "voice-unknown" }) },
    );
    const invalidRate = await GET(
      new Request("http://localhost/api/mock/voices/voice-qinghe/preview?rate=2"),
      { params: Promise.resolve({ voiceId: "voice-qinghe" }) },
    );
    expect(unknownVoice.status).toBe(404);
    expect(invalidRate.status).toBe(404);
  });
});
