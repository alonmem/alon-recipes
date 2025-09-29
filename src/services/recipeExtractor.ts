import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export interface Ingredient {
  name: string;
  amount: string;
  unit: string;
}

export interface RecipeExtractionResult {
  ingredients: Ingredient[];
  instructions: string[];
}

export async function extractRecipeFromUrl(url: string): Promise<RecipeExtractionResult> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch recipe HTML: ${response.status}`);
    }
    const html = await response.text();

    const prompt = `
You are a recipe extraction assistant.
You will be given the full HTML of a recipe webpage.
Extract two things in JSON format:
- "ingredients": an array of ingredient strings exactly as they appear in the recipe.
- "instructions": an array of step-by-step cooking instructions.

Important:
- If instructions are embedded in other sections (like "Roasting", "Tips", or bullet lists),
  include them as steps anyway.
- Do not include serving suggestions or unrelated notes.
- Always return valid JSON only.

HTML:
${html}
`;

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
    });

    const raw = completion.choices[0].message?.content ?? "{}";
    let parsed: { ingredients?: string[]; instructions?: string[] };

    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.error("Failed to parse AI response as JSON:", raw);
      throw err;
    }

    // 🔑 Normalize into the old shape Lovable expects
    const normalizedIngredients: Ingredient[] = (parsed.ingredients ?? []).map((item: string) => ({
      name: item,
      amount: "",
      unit: "",
    }));

    return {
      ingredients: normalizedIngredients,
      instructions: parsed.instructions ?? [],
    };
  } catch (error) {
    console.error("Recipe extraction failed:", error);
    return { ingredients: [], instructions: [] };
  }
}
