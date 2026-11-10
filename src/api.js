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
  clothing: "Clothes",
  shoes: "Footwear",
  food: "Food",
  drinks: "Beverages",
};

// What the tag screen needs from the classifier:
//   category    app category to fill in, or null when there is nothing to suggest
//   confidence  0 to 1
//   kind        "match"  the model is sure and the category is one of ours
//               "others" the model is sure it is something else
//               "unsure" below the threshold, so the server gave up
export async function classifyForTag(dataUrl) {
  const { category, confidence } = await classifyPhoto(dataUrl);
  const appCategory = MODEL_TO_APP_CATEGORY[category] ?? null;

  let kind = "match";
  if (!appCategory) {
    kind = confidence >= CONFIDENCE_THRESHOLD ? "others" : "unsure";
  }
  return { category: appCategory, confidence, kind };
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
