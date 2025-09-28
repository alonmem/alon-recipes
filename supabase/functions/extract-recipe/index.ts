import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecipeExtractionResult {
  success: boolean;
  title?: string;
  description?: string;
  ingredients?: Array<{ name: string; amount: string; unit: string }>;
  instructions?: string[];
  cookTime?: number;
  servings?: number;
  image?: string;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    if (!url) {
      throw new Error('URL is required');
    }

    console.log('Extracting recipe from URL:', url);

    // Fetch website content using a more reliable method
    const websiteResponse = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    if (!websiteResponse.ok) {
      throw new Error(`Failed to fetch website: ${websiteResponse.status} ${websiteResponse.statusText}`);
    }

    const htmlContent = await websiteResponse.text();
    console.log('Website content fetched, length:', htmlContent.length);

    // Try JSON-LD (schema.org Recipe) extraction first
    const jsonLd = extractRecipeFromJsonLd(htmlContent);
    if (jsonLd) {
      console.log('Recipe found via JSON-LD');
      const result: RecipeExtractionResult = { success: true, ...jsonLd };
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean HTML and extract meaningful text for AI/basic fallback
    const cleanedText = cleanHtmlContent(htmlContent);
    
    // Use AI to extract recipe information
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Sending content to AI for analysis...');

    // Try GPT-5 Nano first
    try {
      const gpt5Response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-nano-2025-08-07',
          max_completion_tokens: 2000,
          messages: [
            {
            role: 'system',
            content: `You are a recipe extraction expert. Extract recipe information from website content and return ONLY valid JSON with this exact structure:

{
  "title": "Recipe Name",
  "description": "Brief description",
  "ingredients": [
    {"name": "ingredient name", "amount": "quantity", "unit": "measurement unit"}
  ],
  "instructions": ["step 1", "step 2", "step 3"],
  "cookTime": 30,
  "servings": 4,
  "image": "image_url_if_found_or_null"
}

CRITICAL RULES for Instructions:
- Extract ALL cooking steps in logical order, including preparation steps
- Look for sections titled "Instructions", "Directions", "Method", "Steps", "Preparation"
- Include bullet points, numbered steps, and any cooking actions
- Combine related sub-steps if they're part of the same process
- Include timing information when mentioned (e.g., "roast for 45 minutes")
- Include temperature settings (e.g., "preheat oven to 375F")
- Keep each instruction complete and clear

Other Rules:
- Include ALL ingredients with proper measurements
- Convert fractions to decimals (e.g., "1/2" -> "0.5")
- Use standard units: cups, tsp, tbsp, oz, lbs, g, kg, ml, l, pieces, cloves
- cookTime in minutes, servings as number
- If no clear recipe found, return {"error": "No recipe found"}
- Return ONLY the JSON, no other text`
            },
            {
              role: 'user',
              content: `Extract the recipe from this website content:\n\n${cleanedText.substring(0, 8000)}`
            }
          ]
        }),
      });

      if (gpt5Response.ok) {
        const gpt5Data = await gpt5Response.json();
        const extractedContent = gpt5Data.choices[0].message.content.trim();
        
        if (extractedContent) {
          let recipeData;
          try {
            const jsonContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            recipeData = JSON.parse(jsonContent);
          } catch (parseError) {
            console.error('Failed to parse GPT-5 response as JSON:', parseError);
            throw new Error('Failed to parse recipe data from GPT-5 response');
          }

          if (recipeData.error) {
            return new Response(
              JSON.stringify({ success: false, error: recipeData.error }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            );
          }

          const result: RecipeExtractionResult = {
            success: true,
            title: recipeData.title,
            description: recipeData.description,
            ingredients: recipeData.ingredients || [],
            instructions: recipeData.instructions || [],
            cookTime: recipeData.cookTime || 0,
            servings: recipeData.servings || 1,
            image: recipeData.image || undefined,
          };

          console.log('Recipe extraction successful via GPT-5 Nano');
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      } else {
        const errorText = await gpt5Response.text();
        console.error('GPT-5 Nano API error:', errorText);
        if (gpt5Response.status === 429) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.code === 'insufficient_quota') {
              console.log('GPT-5 Nano quota exceeded, falling back to basic extraction');
              const fallbackResult = basicRecipeExtraction(cleanedText);
              return new Response(
                JSON.stringify(fallbackResult),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      console.error('Error calling GPT-5 Nano:', e);
    }

    // Fallback to GPT-4o if GPT-5 fails
    console.log('Falling back to GPT-4o...');
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a recipe extraction expert. Extract recipe information from website content and return ONLY valid JSON with this exact structure:

{
  "title": "Recipe Name",
  "description": "Brief description",
  "ingredients": [
    {"name": "ingredient name", "amount": "quantity", "unit": "measurement unit"}
  ],
  "instructions": ["step 1", "step 2", "step 3"],
  "cookTime": 30,
  "servings": 4,
  "image": "image_url_if_found_or_null"
}

CRITICAL RULES for Instructions:
- Extract ALL cooking steps in logical order, including preparation steps
- Look for sections titled "Instructions", "Directions", "Method", "Steps", "Preparation"
- Include bullet points, numbered steps, and any cooking actions
- Combine related sub-steps if they're part of the same process
- Include timing information when mentioned (e.g., "roast for 45 minutes")
- Include temperature settings (e.g., "preheat oven to 375F")
- Keep each instruction complete and clear

Other Rules:
- Include ALL ingredients with proper measurements
- Convert fractions to decimals (e.g., "1/2" -> "0.5")
- Use standard units: cups, tsp, tbsp, oz, lbs, g, kg, ml, l, pieces, cloves
- cookTime in minutes, servings as number
- If no clear recipe found, return {"error": "No recipe found"}
- Return ONLY the JSON, no other text`
          },
          {
            role: 'user',
            content: `Extract the recipe from this website content:\n\n${cleanedText.substring(0, 8000)}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      console.error('OpenAI API error:', errorText);
      
      // Handle quota exceeded error specifically
      if (openaiResponse.status === 429) {
        try {
          const errorData = JSON.parse(errorText);
          if (errorData.error?.code === 'insufficient_quota') {
            console.log('OpenAI quota exceeded, falling back to basic extraction');
            const fallbackResult = basicRecipeExtraction(cleanedText);
            return new Response(
              JSON.stringify(fallbackResult),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            );
          }
        } catch (_) {}
      }
      
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const openaiResult = await openaiResponse.json();
    console.log('OpenAI response received');

    const extractedContent = openaiResult.choices[0].message.content.trim();
    console.log('Extracted content:', extractedContent);

    // Parse the JSON response
    let recipeData;
    try {
      // Remove any potential markdown code blocks
      const jsonContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      recipeData = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response as JSON:', parseError);
      throw new Error('Failed to parse recipe data from AI response');
    }

    if (recipeData.error) {
      return new Response(
        JSON.stringify({
          success: false,
          error: recipeData.error
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      );
    }

    const result: RecipeExtractionResult = {
      success: true,
      title: recipeData.title,
      description: recipeData.description,
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || [],
      cookTime: recipeData.cookTime || 0,
      servings: recipeData.servings || 1,
      image: recipeData.image || undefined
    };

    console.log('Recipe extraction successful');

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in extract-recipe function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract recipe'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function extractRecipeFromJsonLd(html: string): Omit<RecipeExtractionResult, 'success' | 'error'> | null {
  try {
    const scriptRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const jsonText = match[1].trim();
      const candidates: any[] = [];
      try {
        const parsed = JSON.parse(jsonText);
        if (Array.isArray(parsed)) {
          candidates.push(...parsed);
        } else {
          candidates.push(parsed);
        }
      } catch (_) {
        const parts = jsonText.split(/}\s*,\s*{+/).map((p) => p.trim());
        for (const p of parts) {
          try {
            const fixed = p.startsWith('{') ? p : '{' + p;
            const final = fixed.endsWith('}') ? fixed : fixed + '}';
            candidates.push(JSON.parse(final));
          } catch (_) {}
        }
      }

      for (const c of candidates) {
        const obj = c['@graph'] ? (c['@graph'].find((n: any) => (Array.isArray(n['@type']) ? n['@type'].includes('Recipe') : n['@type'] === 'Recipe'))) : c;
        const type = obj?.['@type'];
        const isRecipe = Array.isArray(type) ? type.includes('Recipe') : type === 'Recipe';
        if (!isRecipe) continue;

        const title = obj.name || obj.headline || undefined;
        const description = obj.description || undefined;
        const image = Array.isArray(obj.image) ? obj.image[0] : (typeof obj.image === 'object' ? obj.image?.url : obj.image);

        const ingredientLines: string[] = Array.isArray(obj.recipeIngredient) ? obj.recipeIngredient : [];
        const ingredients = ingredientLines
          .map((line: string) => normalizeIngredient(line))
          .filter(Boolean) as Array<{ name: string; amount: string; unit: string }>;

        let instructions: string[] = [];
        if (Array.isArray(obj.recipeInstructions)) {
          instructions = obj.recipeInstructions.map((step: any) => typeof step === 'string' ? step : (step?.text || '')).filter((s: string) => s && s.length > 3);
        } else if (typeof obj.recipeInstructions === 'string') {
          instructions = obj.recipeInstructions.split(/\n+|\r+/).map((s: string) => s.trim()).filter((s: string) => s.length > 3);
        }

        const cookTime = obj.totalTime ? parseIsoDurationToMinutes(obj.totalTime) : (obj.cookTime ? parseIsoDurationToMinutes(obj.cookTime) : 0);
        const servings = obj.recipeYield ? parseServings(obj.recipeYield) : 1;

        return {
          title,
          description,
          ingredients,
          instructions,
          cookTime,
          servings,
          image,
        };
      }
    }
  } catch (e) {
    console.error('Error parsing JSON-LD:', e);
  }
  return null;
}

function parseIsoDurationToMinutes(iso: string): number {
  if (!iso || typeof iso !== 'string') return 0;
  const match = iso.match(/P(?:\d+Y)?(?:\d+M)?(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 60 + minutes + Math.round(seconds / 60);
}

function parseServings(yieldVal: any): number {
  if (typeof yieldVal === 'number') return yieldVal;
  if (typeof yieldVal === 'string') {
    const m = yieldVal.match(/\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return 1;
}

function normalizeIngredient(line: string): { name: string; amount: string; unit: string } | null {
  if (!line) return null;
  const text = line.replace(/\s+/g, ' ').trim();
  const fracToDec = (s: string) => {
    const parts = s.split(' ');
    let total = 0;
    for (const p of parts) {
      if (/^\d+$/.test(p)) total += parseFloat(p);
      else if (/^\d+\/\d+$/.test(p)) {
        const [a, b] = p.split('/').map(Number);
        if (b) total += a / b;
      }
    }
    return total ? String(parseFloat(total.toFixed(2))) : s;
  };

  const pattern = /(\d+[\d\s\/\.]*)\s*(cups?|cup|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|pieces?|slices?)?\s*(.*)/i;
  const m = text.match(pattern);
  if (m) {
    const amount = fracToDec((m[1] || '').trim());
    const unit = (m[2] || '').trim();
    let name = (m[3] || '').trim();
    name = name.replace(/^of\s+/i, '').replace(/[\(\)]/g, '').trim();
    if (name.length < 2) return null;
    return {
      name: name.charAt(0).toUpperCase() + name.slice(1),
      amount: amount || '1',
      unit: unit || '',
    };
  }
  const clean = text.replace(/[\(\)]/g, '').trim();
  if (clean.length < 2) return null;
  return { name: clean.charAt(0).toUpperCase() + clean.slice(1), amount: '1', unit: '' };
}

function cleanHtmlContent(html: string): string {
  // Remove script and style tags
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Extract text content while preserving some structure
  cleaned = cleaned.replace(/<\/?(h[1-6]|p|div|section|article|main|li|td|th)[^>]*>/gi, '\n');
  cleaned = cleaned.replace(/<br[^>]*>/gi, '\n');
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');
  
  // Decode HTML entities
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  
  // Normalize whitespace but preserve newlines for better parsing
  cleaned = cleaned.replace(/[\t\f\v\r ]+/g, ' '); // collapse spaces/tabs
  cleaned = cleaned.replace(/\n{2,}/g, '\n'); // collapse multiple blank lines
  cleaned = cleaned.replace(/\s*\n\s*/g, '\n'); // trim around newlines
  
  return cleaned.trim();
}

function basicRecipeExtraction(content: string): RecipeExtractionResult {
  const instructions: string[] = [];
  const ingredients: Array<{ name: string; amount: string; unit: string }> = [];
  
  console.log('Using basic extraction fallback');
  console.log('Content sample:', content.substring(0, 500));
  
  // Split content into lines and filter out very short lines
  const lines = content.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 5);
  
  console.log('Total lines to process:', lines.length);
  
  // Look for instruction sections and step patterns
  const instructionKeywords = [
    'heat', 'cook', 'bake', 'fry', 'boil', 'simmer', 'mix', 'stir', 'add', 
    'combine', 'whisk', 'blend', 'chop', 'dice', 'slice', 'melt', 'pour',
    'season', 'serve', 'preheat', 'remove', 'transfer', 'cover', 'prepare',
    'place', 'drain', 'rinse', 'cut', 'wash', 'peel', 'grate', 'sprinkle',
    'roast', 'toast', 'wrap', 'trim', 'arrange', 'drizzle', 'toss'
  ];

  // Instruction section indicators
  const instructionSectionWords = ['instructions', 'directions', 'method', 'preparation', 'steps'];
  
  // More flexible ingredient detection
  const ingredientPatterns = [
    /(\d+(?:[\/.\d]*)?)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|pieces?|slices?)\s+(?:of\s+)?([^,\n\(]+)/gi,
    /([a-zA-Z\s]+)\s*[-–]\s*(\d+(?:[\/.\d]*)?)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|pieces?|slices?)/gi,
    /(\d+(?:[\/.\d]*)?)\s*(large|medium|small|whole|fresh)?\s*([a-zA-Z\s]+?)(?=\n|$|,|\()/gi
  ];

  let foundIngredientsCount = 0;
  let foundInstructionsCount = 0;
  let inInstructionSection = false;

  // Process each line with context awareness
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Skip very long lines (likely paragraphs) and very short ones
    if (line.length < 5 || line.length > 300) continue;
    
    // Check if we're entering an instruction section
    if (instructionSectionWords.some(word => lowerLine.includes(word)) && 
        (lowerLine.includes('##') || lowerLine.includes('###') || line.length < 50)) {
      inInstructionSection = true;
      console.log('Found instruction section:', line);
      continue;
    }
    
    // Check if we're leaving instruction section (new major section)
    if (inInstructionSection && 
        (lowerLine.includes('nutrition') || lowerLine.includes('notes') || 
         lowerLine.includes('video') || lowerLine.includes('comments'))) {
      inInstructionSection = false;
    }
    
    // Extract instructions with higher priority if in instruction section
    const isBulletPoint = /^\s*[-•*]\s+/.test(line);
    const isNumberedStep = /^\d+[\.\)]\s*/.test(line);
    const hasInstructionWords = instructionKeywords.some(keyword => lowerLine.includes(keyword));
    const isReasonableLength = line.length >= 15 && line.length <= 300;
    const hasActionStructure = /\b(heat|cook|add|mix|stir|place|put|combine|whisk|roast|toast|wrap|trim|arrange|drizzle|toss|preheat|remove)\b.*\b(until|for|to|in|with|and|then|so)\b/i.test(line);
    
    // Instructions are more likely if:
    // 1. We're in an instruction section, OR
    // 2. It's a numbered/bulleted step, OR  
    // 3. It has cooking action words AND structure
    if (((inInstructionSection && (isBulletPoint || hasInstructionWords)) || 
         isNumberedStep || 
         (hasInstructionWords && hasActionStructure)) && 
        isReasonableLength && 
        foundInstructionsCount < 25) {
      
      let cleanInstruction = line
        .replace(/^\s*[-•*]\s*/, '') // Remove bullet points
        .replace(/^\d+[\.\)]\s*/, '') // Remove numbering
        .replace(/^#+\s*/, '') // Remove markdown headers
        .trim();
      
      // Skip if it looks like a section header or too short
      if (cleanInstruction.length > 15 && 
          !cleanInstruction.toLowerCase().includes('roasting') && // Skip section headers
          !cleanInstruction.toLowerCase().includes('to make') &&
          !instructions.some(existing => existing.toLowerCase() === cleanInstruction.toLowerCase())) {
        instructions.push(cleanInstruction);
        foundInstructionsCount++;
        console.log('Found instruction:', cleanInstruction.substring(0, 50) + '...');
      }
    }
    
    // Extract ingredients (existing logic)
    if (!inInstructionSection) { // Don't extract ingredients from instruction sections
      ingredientPatterns.forEach(pattern => {
        pattern.lastIndex = 0;
        let match;
        while ((match = pattern.exec(line)) !== null && foundIngredientsCount < 25) {
          let amount = '', unit = '', name = '';
          
          if (pattern.source.includes('cups?|tablespoons?')) {
            if (match[1] && match[2] && match[3]) {
              amount = match[1].trim();
              unit = match[2].trim();
              name = match[3].trim();
            }
          } else if (pattern.source.includes('[-–]')) {
            if (match[1] && match[2] && match[3]) {
              name = match[1].trim();
              amount = match[2].trim();
              unit = match[3].trim();
            }
          } else {
            if (match[1] && match[3]) {
              amount = match[1].trim();
              unit = match[2] ? match[2].trim() : '';
              name = match[3].trim();
            }
          }
          
          name = name.replace(/[^\w\s-]/g, '').trim();
          
          if (name.length > 2 && name.length < 50 && 
              !name.toLowerCase().includes('step') &&
              !name.toLowerCase().includes('instruction') &&
              !instructionKeywords.some(keyword => name.toLowerCase().includes(keyword))) {
            
            ingredients.push({
              name: name.charAt(0).toUpperCase() + name.slice(1),
              amount: amount || '1',
              unit: unit || ''
            });
            foundIngredientsCount++;
          }
        }
      });
    }
  }

  // Try to extract title - look for lines that could be titles
  let title = '';
  for (const line of lines.slice(0, 40)) {
    if (line.length > 10 && line.length < 80 && 
        /^[A-Z]/.test(line) && 
        !line.includes('•') &&
        !line.includes('–') &&
        !/recipe/i.test(line) &&
        !instructionKeywords.some(keyword => line.toLowerCase().includes(keyword)) &&
        !ingredientPatterns.some(pattern => {
          pattern.lastIndex = 0;
          return pattern.test(line);
        })) {
      title = line;
      break;
    }
  }

  console.log(`Basic extraction found: ${instructions.length} instructions, ${ingredients.length} ingredients`);
  console.log('Instructions found:', instructions.slice(0, 3));
  console.log('Ingredients found:', ingredients.slice(0, 3));

  return {
    success: true,
    title: title || 'Extracted Recipe',
    description: 'Recipe extracted using non-AI fallback method',
    instructions,
    ingredients,
    cookTime: 0,
    servings: 1,
    image: undefined
  };
}