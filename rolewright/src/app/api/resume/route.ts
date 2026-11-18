import { getDb } from "@/lib/db/index.mjs";
import { changeFacts, saveResume } from "@/lib/db/repo.mjs";
import { confirmationCounts, normalizeFacts } from "@/lib/facts.mjs";
import { extractFacts } from "@/lib/llm/index.mjs";
import { readBodyBytes } from "@/lib/server/body";
import { HttpError, json, route } from "@/lib/server/http";
import { readLlmHeaders } from "@/lib/server/llm-key";
import { pdfText } from "@/lib/server/pdf-text.mjs";
import { takeRateLimit } from "@/lib/server/rate-limit";
import { requireUser } from "@/lib/server/session";

export const runtime = "nodejs";

const MAX_FILE = 5 * 1024 * 1024;
// Room for the multipart boundaries and part headers around the file itself.
const MAX_BODY = MAX_FILE + 64 * 1024;
const MIN_TEXT = 200;
const PDF_TYPES = new Set(["application/pdf", "application/x-pdf"]);

const notPdf = () => new HttpError(415, "not_pdf", "That file is not a PDF. Save your resume as a PDF and upload it again.");

function startsWithPdfMagic(bytes: Uint8Array): boolean {
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
  return bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);
}

const cleanFilename = (name: string) => name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200) || "resume.pdf";

export const POST = route("resume.upload", async (req, { state }) => {
  const userId = await requireUser(state);
  takeRateLimit("upload", userId);
  const llm = readLlmHeaders(req);

  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("multipart/form-data")) {
    throw new HttpError(415, "unsupported_type", "Upload your resume as a PDF file.");
  }
  // Read with a cap first: parsing a form buffers the whole body, whatever its size.
  const body = await readBodyBytes(req, MAX_BODY, "That file");
  let form: FormData;
  try {
    form = await new Response(body as Uint8Array<ArrayBuffer>, { headers: { "content-type": type } }).formData();
  } catch {
    throw new HttpError(400, "bad_upload", "The upload could not be read. Try again.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "no_file", "Choose a PDF file to upload.");
  if (file.size > MAX_FILE) throw new HttpError(413, "too_large", "That file is larger than 5 MB.");
  if (file.type && !PDF_TYPES.has(file.type.toLowerCase())) throw notPdf();
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!startsWithPdfMagic(bytes)) throw notPdf();

  // Never written to disk: the bytes live only in this request.
  const { text } = await pdfText(bytes);
  if (text.replace(/\s+/g, " ").trim().length < MIN_TEXT) {
    throw new HttpError(
      422,
      "no_text",
      "We could not find enough text in this PDF. It looks like a scanned or image-only file, which is not supported yet. Upload a PDF saved from Word, Google Docs or a similar tool.",
    );
  }

  const raw = await extractFacts({ provider: llm.provider, key: llm.key, model: llm.model, resumeText: text });
  const proposed = normalizeFacts(raw, { trustConfirmed: false });

  const db = await getDb();
  await saveResume(db, userId, { filename: cleanFilename(file.name), rawText: text });
  // A new resume replaces the proposal, all unconfirmed, but never what the
  // user stated themselves or said they cannot confirm. Read and written under
  // the facts row lock, so a review action at the same moment is not lost.
  const facts = await changeFacts(db, userId, (existing) => ({
    ...proposed,
    extras: existing.extras ?? [],
    cannotConfirm: existing.cannotConfirm ?? [],
  }));
  return json({ facts, counts: confirmationCounts(facts) });
});
