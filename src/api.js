// Talks to the Budgey backend (FastAPI). The backend is stateless: it never
// stores photos or embeddings, so the app keeps those in the browser/device.
const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request(path, options) {
  const res = await fetch(`${API_URL}${path}`, options);
  if (!res.ok) {
    throw new Error(`Backend ${path} failed (${res.status})`);
  }
  return res.json();
}

// Send a photo (data URL from the camera) to the classifier.
// Returns { model, category, confidence } where category is one of the model's
// classes: clothing, drinks, food, other, shoes. Low-confidence photos come
// back as "other" (the server applies the threshold).
export async function classifyPhoto(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const form = new FormData();
  form.append("file", blob, "photo.jpg");
  return request("/v1/classify", { method: "POST", body: form });
}

// The model's classes -> the category names used in the tag form.
// "other" is left out on purpose: no suggestion, the user picks.
const MODEL_TO_APP_CATEGORY = {
  clothing: "Apparel",
  shoes: "Apparel",
  food: "Food & Drinks",
  drinks: "Food & Drinks", // food and drinks share one category in the app
};

// Returns an app category name, or null when there is nothing to suggest.
export async function suggestCategory(dataUrl) {
  const { category } = await classifyPhoto(dataUrl);
  return MODEL_TO_APP_CATEGORY[category] ?? null;
}

// Compare an embedding with stored ones: candidates = [{ id, embedding }].
// Returns { matched, matches: [{ id, score }], threshold }.
export function matchEmbedding(embedding, candidates, { topK = 3 } = {}) {
  return request("/v1/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embedding, candidates, top_k: topK }),
  });
}
