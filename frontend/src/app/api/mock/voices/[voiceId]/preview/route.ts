import { z } from "zod";

const PreviewVoiceSchema = z.enum([
  "voice-qinghe",
  "voice-zhiyuan",
  "voice-mingxi",
]);
const PreviewRateSchema = z.coerce.number().min(0.75).max(1.5);

export async function GET(
  request: Request,
  context: { params: Promise<{ voiceId: string }> },
): Promise<Response> {
  const { voiceId: rawVoiceId } = await context.params;
  const voiceId = PreviewVoiceSchema.safeParse(rawVoiceId);
  const rate = PreviewRateSchema.safeParse(
    new URL(request.url).searchParams.get("rate") ?? "1",
  );
  if (!voiceId.success || !rate.success) {
    return new Response(null, { status: 404 });
  }

  const target = new URL(
    `/audio/voice-previews/${voiceId.data}.mp3`,
    request.url,
  );
  return Response.redirect(target, 307);
}
