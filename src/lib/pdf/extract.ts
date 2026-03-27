import { PDFParse } from "pdf-parse";

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  // setImmediate로 이벤트 루프 양보하여 서버 블로킹 방지
  await new Promise((resolve) => setImmediate(resolve));
  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
}

export async function extractTextFromFile(
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  if (mimeType === "application/pdf") {
    const text = await extractTextFromPDF(buffer);
    if (text.trim().length < 50) {
      return await extractWithOCR(buffer);
    }
    return text;
  }

  if (mimeType === "text/plain" || mimeType === "text/html") {
    return buffer.toString("utf-8");
  }

  if (mimeType.startsWith("image/")) {
    return await extractWithOCR(buffer);
  }

  throw new Error(`지원하지 않는 파일 형식입니다: ${mimeType}`);
}

async function extractWithOCR(buffer: Buffer): Promise<string> {
  const invokeUrl = process.env.CLOVA_OCR_INVOKE_URL;
  const secretKey = process.env.CLOVA_OCR_SECRET_KEY;

  if (!invokeUrl || !secretKey) {
    throw new Error(
      "CLOVA OCR 키가 설정되지 않았습니다. 스캔된 문서는 OCR이 필요합니다."
    );
  }

  const base64Image = buffer.toString("base64");

  const response = await fetch(invokeUrl, {
    method: "POST",
    headers: {
      "X-OCR-SECRET": secretKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      version: "V2",
      requestId: crypto.randomUUID(),
      timestamp: Date.now(),
      lang: "ko",
      images: [
        {
          format: "pdf",
          name: "contract",
          data: base64Image,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`CLOVA OCR error: ${response.status}`);
  }

  const data = await response.json();
  const fields = data.images?.[0]?.fields || [];
  return fields.map((f: { inferText: string }) => f.inferText).join(" ");
}
