import type { Avatar, MockRequestOptions } from "@/types";

import { mockDb } from "./mock-client";
import { simulateRequest } from "./shared";

export async function listAvatars(
  options: MockRequestOptions = {},
): Promise<Avatar[]> {
  await simulateRequest(options, 520);
  return structuredClone(mockDb.avatars);
}
