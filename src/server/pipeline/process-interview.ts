/**
 * Post-interview processing pipeline entry point.
 *
 * PLACEHOLDER (Task 10): the real body — transcribing/segmenting the audio,
 * extracting facts, updating topic coverage, writing the recap summary — lands
 * in Task 12, which replaces this function. Until then it's a no-op so the
 * complete route can call it fire-and-forget without a hard dependency on the
 * pipeline existing yet.
 */
export async function processInterview(interviewId: string): Promise<void> {
  console.log(`[process-interview] placeholder invoked for interview ${interviewId} — pipeline arrives in Task 12`);
}
