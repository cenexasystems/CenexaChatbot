import { requireBusinessAccess, requirePermission } from "@/lib/api-auth";
import { knowledgeSearchTerms, splitKnowledgeText } from "@/lib/knowledge";

export const runtime = "nodejs";
const MAX_FILE_BYTES = 1_000_000;
const MAX_FILES = 25;
const MAX_EXTRACTED_CHARS = 200_000;
const ALLOWED_EXTENSIONS = new Set(["txt", "md", "csv", "json", "pdf"]);

function safeFileName(value: string): string {
  return value.replace(/[\\/\u0000-\u001f]/g, "_").trim().slice(0, 180) || "knowledge.txt";
}

export async function GET() {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "assistant_settings");
  if (denied) return denied;
  const { data, error } = await access.admin.from("assistant_knowledge_files")
    .select("id,file_name,mime_type,size_bytes,chunk_count,created_at")
    .eq("business_id", access.businessId)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: "Unable to load knowledge files" }, { status: 500 });
  return Response.json({ files: data ?? [] });
}

export async function POST(request: Request) {
  const { access, response } = await requireBusinessAccess();
  if (response) return response;
  const denied = requirePermission(access, "assistant_settings");
  if (denied) return denied;

  let form: FormData;
  try { form = await request.formData(); }
  catch { return Response.json({ error: "Choose a text, Markdown, CSV, JSON, or PDF file" }, { status: 400 }); }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return Response.json({ error: "Choose a file to upload" }, { status: 400 });
  if (file.size > MAX_FILE_BYTES) return Response.json({ error: "Knowledge files must be 1 MB or smaller" }, { status: 413 });
  const fileName = safeFileName(file.name);
  const extension = fileName.split(".").at(-1)?.toLocaleLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) return Response.json({ error: "Supported files: .txt, .md, .csv, .json, and text-based .pdf" }, { status: 415 });

  let text: string;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (extension === "pdf") {
      const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
      const document = await getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true }).promise;
      if (document.numPages > 100) {
        await document.destroy();
        return Response.json({ error: "PDFs must have 100 pages or fewer" }, { status: 413 });
      }
      const pages: string[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
        page.cleanup();
      }
      await document.destroy();
      text = pages.join("\n");
      if (!text.trim()) return Response.json({ error: "This PDF has no selectable text. Scanned PDFs need OCR before upload." }, { status: 422 });
    } else {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
    }
  }
  catch { return Response.json({ error: "The file must contain UTF-8 text" }, { status: 400 }); }
  text = text.replace(/\u0000/g, "").trim();
  if (!text) return Response.json({ error: "The file is empty" }, { status: 400 });
  if (text.length > MAX_EXTRACTED_CHARS) return Response.json({ error: "Extracted text must be 200,000 characters or less" }, { status: 413 });

  const { count, error: countError } = await access.admin.from("assistant_knowledge_files")
    .select("id", { count: "exact", head: true }).eq("business_id", access.businessId);
  if (countError) return Response.json({ error: "Unable to check the knowledge-file limit" }, { status: 500 });
  if ((count ?? 0) >= MAX_FILES) return Response.json({ error: `A business can have up to ${MAX_FILES} knowledge files` }, { status: 409 });

  const chunks = splitKnowledgeText(text);
  const { data: savedFile, error: saveError } = await access.admin.from("assistant_knowledge_files").insert({
    business_id: access.businessId,
    file_name: fileName,
    mime_type: file.type || "text/plain",
    size_bytes: file.size,
    chunk_count: chunks.length,
    created_by: access.userId,
  }).select("id,file_name,mime_type,size_bytes,chunk_count,created_at").single();
  if (saveError || !savedFile) return Response.json({ error: "Unable to save knowledge file" }, { status: 500 });

  const filenameTerms = knowledgeSearchTerms(fileName.replace(/\.[^.]+$/, ""));
  const records = chunks.map((content, chunkIndex) => ({
    business_id: access.businessId,
    file_id: savedFile.id,
    file_name: fileName,
    chunk_index: chunkIndex,
    content,
    search_terms: [...new Set([...filenameTerms, ...knowledgeSearchTerms(content)])],
  }));
  const { error: chunkError } = await access.admin.from("assistant_knowledge_chunks").insert(records);
  if (chunkError) {
    await access.admin.from("assistant_knowledge_files").delete().eq("id", savedFile.id).eq("business_id", access.businessId);
    return Response.json({ error: "Unable to index knowledge file" }, { status: 500 });
  }
  return Response.json({ file: savedFile }, { status: 201 });
}
