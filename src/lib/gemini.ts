type GeminiChoice = {
  choiceLabel: string;
  choiceText: string;
  isCorrect: boolean;
};

type GenerateAiExplanationInput = {
  examName: string;
  categoryName: string;
  questionText: string;
  officialExplanation: string | null;
  choices: GeminiChoice[];
};

type GeminiInteractionResponse = {
  output_text?: unknown;
  steps?: Array<{
    content?: unknown;
    type?: unknown;
  }>;
  error?: {
    message?: unknown;
    code?: unknown;
  };
};

const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash";

export function getGeminiModelName() {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_GEMINI_MODEL;
}

export async function generateAiExplanation(input: GenerateAiExplanationInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const model = getGeminiModelName();
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      model,
      system_instruction:
        "あなたはITパスポート試験・基本情報技術者試験を学ぶ学生向けの解説者です。与えられた問題情報だけを根拠に、日本語で簡潔かつ正確に説明してください。断定できない内容は推測せず、その旨を短く述べてください。",
      input: buildPrompt(input),
      generation_config: {
        temperature: 0.2,
        thinking_level: "low",
      },
    }),
  });

  const data = (await response.json().catch(() => null)) as GeminiInteractionResponse | null;

  if (!response.ok) {
    throw new Error(`Gemini API request failed with status ${response.status}: ${getGeminiErrorMessage(data)}`);
  }

  const answerText = extractGeminiText(data);

  if (!answerText) {
    throw new Error("Gemini API returned an empty explanation");
  }

  return {
    modelName: model,
    answerText,
  };
}

function getGeminiErrorMessage(data: GeminiInteractionResponse | null) {
  const message = data?.error?.message;
  if (typeof message === "string" && message.trim()) {
    return message.trim();
  }

  return "Unknown error";
}

function extractGeminiText(data: GeminiInteractionResponse | null) {
  if (!data) return "";

  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  const stepTexts = data.steps
    ?.filter((step) => step.type === "model_output")
    .flatMap((step) => extractTextParts(step.content))
    .filter((text) => text.trim())
    .map((text) => text.trim());

  return stepTexts?.join("\n\n").trim() ?? "";
}

function extractTextParts(value: unknown): string[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap(extractTextParts);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (record.type === "text" && typeof record.text === "string") {
      return [record.text];
    }
  }

  return [];
}

function buildPrompt(input: GenerateAiExplanationInput) {
  const choices = input.choices
    .map((choice) => {
      const correctness = choice.isCorrect ? "正解" : "不正解";
      return `${choice.choiceLabel}. ${choice.choiceText}\n判定: ${correctness}`;
    })
    .join("\n\n");

  return `以下の過去問について、学生が復習しやすいAI補助解説を作成してください。

条件:
- 学生の選択肢は考慮しない
- 全ての選択肢について、正しい理由または違う理由を書く
- 出力は次の見出しを必ず使う
  1. 正解の理由
  2. 各選択肢の解説
  3. 覚え方のポイント
- 長くなりすぎないように、各項目は2〜4文程度にまとめる

試験:
${input.examName}

分野:
${input.categoryName}

問題文:
${input.questionText}

選択肢:
${choices}

既存の公式・登録済み解説:
${input.officialExplanation?.trim() || "なし"}`;
}
