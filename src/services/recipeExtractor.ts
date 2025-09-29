import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface RecipeExtractionResult {
  ingredients: string[];
  instructions: string[];
}

export async function extractRecipeFromUrl(url: string): Promise<RecipeExtractionResult> {
  try {
    // 1. Fetch full HTML from the recipe URL
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipe HTML: ${response.status}`);
    }
    const html = await response.text();

    // 2. Ask AI to extract ingredients + instructions
    const prompt = `
You are a recipe extraction assistant.
You will be given the full HTML of a recipe webpage.
Extract two things in JSON format:
- "ingredients": an array of strings, each ingredient as it appears in the recipe.
- "instructions": an array of strings, each step of the preparation process.

Important:
- If instructions are embedded in other sections (like "Roasting", "Tips", or bullet lists),
  include them as step-by-step instructions anyway.
- Do not include tips, serving suggestions, or unrelated notes in instructions.
- Always return valid JSON only.

HTML:
${html}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    // 3. Parse the JSON response
    const raw = completion.choices[0].message?.content ?? "{}";
    let parsed: RecipeExtractionResult;

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse AI response as JSON:", raw);
      throw err;
    }

    // 4. Ensure arrays exist
    return {
      ingredients: parsed.ingredients ?? [],
      instructions: parsed.instructions ?? [],
    };
  } catch (error) {
    console.error("Recipe extraction failed:", error);
    return { ingredients: [], instructions: [] };
  }
}
