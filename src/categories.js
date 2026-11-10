// The categories a purchase can have. "Other" is not stored: picking it lets
// the user type their own category name instead.
export const CATEGORIES = [
  { name: "Drinks", hint: "Beverages" },
  { name: "Shoes", hint: "Footwear" },
  { name: "Clothes", hint: "Clothing" },
  { name: "Food", hint: "Food" },
];

export const OTHER = "Other";

export const isListedCategory = (name) =>
  CATEGORIES.some((c) => c.name === name);