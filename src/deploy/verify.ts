import { SpushError } from "../errors.js";

export type VerifyResult = {
  url: string;
  status: number;
  ok: boolean;
};

export async function verifyUrl(url: string): Promise<VerifyResult> {
  let response: Response;

  try {
    response = await fetch(url, { redirect: "follow" });
  } catch (error) {
    throw new SpushError("VERIFY_FAILED", `Verify request failed for ${url}`, [
      { path: "url", message: error instanceof Error ? error.message : String(error) },
    ]);
  }

  if (response.status !== 200) {
    throw new SpushError("VERIFY_FAILED", `Verify failed for ${url}: HTTP ${response.status}`, [
      { path: "url", message: `Expected HTTP 200, got ${response.status}` },
    ]);
  }

  return { url, status: response.status, ok: true };
}
