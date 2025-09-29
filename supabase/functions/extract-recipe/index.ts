import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RecipeExtractionResult {
  success: boolean;
  ingredients?: string[];
  instructions?: string[];
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

    // Check if it's a YouTube URL and extract video description
    let contentToExtract = '';
    if (isYouTubeUrl(url)) {
      console.log('YouTube URL detected, extracting video description...');
      const videoDescription = await extractYouTubeDescription(url);
      if (videoDescription) {
        contentToExtract = videoDescription;
        console.log('YouTube description extracted, length:', contentToExtract.length);
      }
    }

    // Fetch website content
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

    // Try structured data (JSON-LD) first for exact ingredients/instructions
    const jsonLdResult = extractFromJsonLd(htmlContent);
    if (jsonLdResult) {
      const flat = jsonLdResult.ingredients || [];
      // Try AI refinement for structured ingredients; fallback to heuristic
      const aiStructured = await refineIngredientsWithAI(flat, Deno.env.get('OPENAI_API_KEY') || '');
      const structured = aiStructured && aiStructured.length > 0 ? aiStructured : buildStructuredIngredients(flat);
      const result = {
        success: true,
        ingredients: flat,
        instructions: jsonLdResult.instructions,
        structuredIngredients: structured
      };
      console.log('Returning result from JSON-LD structured data:', result);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use YouTube description if available, otherwise clean HTML
    const textToAnalyze = contentToExtract || cleanHtmlContent(htmlContent);
    
    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Sending content to AI for recipe extraction...');

    // Use AI to extract recipe information (try GPT-5 Nano first)
    let aiResponse;
    try {
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `You are a recipe extraction expert. Extract recipe information from website HTML content and return ONLY valid JSON.

IGNORE: ads, navigation menus, headers, footers, comments, social media widgets, advertisements, unrelated content.

FOCUS ON: recipe ingredients and cooking instructions only.

Return this EXACT structure:
{
  "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"],
  "instructions": ["step 1", "step 2", "step 3"]
}

Rules for ingredients:
- Extract complete ingredient descriptions including amounts and units
- Keep original phrasing (e.g., "2 cups flour", "1/2 teaspoon salt")
- Include preparation notes (e.g., "diced", "chopped", "room temperature")

Rules for instructions:
- Extract ALL cooking steps in logical order
- Include preparation steps, cooking steps, and finishing steps  
- Keep timing and temperature information ("bake for 25 minutes at 350°F")
- Make each step complete and clear
- Combine very short related sub-steps if needed

If no clear recipe found, return: {"error": "No recipe found"}
Return ONLY the JSON, no other text.`
            },
            {
              role: 'user',
              content: `Extract the recipe from this content:\n\n${textToAnalyze.substring(0, 12000)}`
            }
          ]
        }),
      });
    } catch (e) {
      console.error('Error calling GPT-5 Nano:', e);
    }

    // Fallback to GPT-4o if GPT-5 Nano fails
    if (!aiResponse || !aiResponse.ok) {
      console.log('Falling back to GPT-4o...');
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
              content: `You are a recipe extraction expert. Extract recipe information from website HTML content and return ONLY valid JSON.

IGNORE: ads, navigation menus, headers, footers, comments, social media widgets, advertisements, unrelated content.

FOCUS ON: recipe ingredients and cooking instructions only.

Return this EXACT structure:
{
  "ingredients": ["ingredient 1", "ingredient 2", "ingredient 3"],
  "instructions": ["step 1", "step 2", "step 3"]
}

Rules for ingredients:
- Extract complete ingredient descriptions including amounts and units
- Keep original phrasing (e.g., "2 cups flour", "1/2 teaspoon salt")
- Include preparation notes (e.g., "diced", "chopped", "room temperature")

Rules for instructions:
- Extract ALL cooking steps in logical order
- Include preparation steps, cooking steps, and finishing steps  
- Keep timing and temperature information ("bake for 25 minutes at 350°F")
- Make each step complete and clear
- Combine very short related sub-steps if needed

If no clear recipe found, return: {"error": "No recipe found"}
Return ONLY the JSON, no other text.`
            },
            {
              role: 'user',
              content: `Extract the recipe from this content:\n\n${textToAnalyze.substring(0, 12000)}`
            }
          ],
          max_tokens: 2000,
          temperature: 0.1
        }),
      });
    }

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const extractedContent = aiResult.choices[0].message.content.trim();
    console.log('AI extraction result:', extractedContent);

    // Parse the JSON response
    let recipeData;
    try {
      const jsonContent = extractedContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      recipeData = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
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

    // Return simplified structure matching the new format
    const flatIngredients: string[] = recipeData.ingredients || [];
    // Try AI refinement; fallback to heuristic if it fails
    const aiStructured = await refineIngredientsWithAI(flatIngredients, openaiApiKey).catch(() => null);
    const structured = aiStructured && aiStructured.length > 0 ? aiStructured : buildStructuredIngredients(flatIngredients);
    const result = {
      success: true,
      ingredients: flatIngredients,
      instructions: recipeData.instructions || [],
      structuredIngredients: structured
    };

    console.log('Recipe extraction successful:', result);

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

function cleanHtmlContent(html: string): string {
  // Remove script and style tags
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Preserve list items with a dash prefix to help the AI
  cleaned = cleaned.replace(/<li[^>]*>/gi, '\n- ');
  cleaned = cleaned.replace(/<\/(li)[^>]*>/gi, '\n');

  // Preserve block-level boundaries as newlines
  cleaned = cleaned.replace(/<\/?(h[1-6]|p|div|section|article|main|ul|ol|td|th)[^>]*>/gi, '\n');
  cleaned = cleaned.replace(/<br[^>]*>/gi, '\n');
  
  // Drop remaining tags
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
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // keep at most one blank line
  cleaned = cleaned.replace(/\s*\n\s*/g, '\n'); // trim around newlines
  
  return cleaned.trim();
}

// Attempt to extract ingredients/instructions from JSON-LD structured data
function extractFromJsonLd(html: string): { ingredients: string[]; instructions: string[] } | null {
  try {
    const scriptRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
    const blocks: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = scriptRegex.exec(html)) !== null) {
      const raw = match[1]
        .replace(/<!\[CDATA\[/g, '')
        .replace(/\]\]>/g, '')
        .trim();
      if (raw) blocks.push(raw);
    }

    for (const block of blocks) {
      let json: unknown;
      try {
        json = JSON.parse(block);
      } catch (_e) {
        // Some sites embed multiple JSON objects concatenated; try to recover basic cases
        continue;
      }

      const candidates: any[] = [];
      if (Array.isArray(json)) {
        candidates.push(...json);
      } else if (json && typeof json === 'object') {
        const obj: any = json;
        if (obj['@graph'] && Array.isArray(obj['@graph'])) {
          candidates.push(...obj['@graph']);
        }
        candidates.push(obj);
      }

      for (const node of candidates) {
        if (!node || typeof node !== 'object') continue;
        const typeField = node['@type'];
        const isRecipe = (Array.isArray(typeField) && typeField.includes('Recipe')) || typeField === 'Recipe';
        const hasRecipeFields = node.recipeIngredient || node.recipeInstructions;
        if (!isRecipe && !hasRecipeFields) continue;

        const ingredients: string[] = normalizeIngredients(node.recipeIngredient);
        const instructions: string[] = normalizeInstructions(node.recipeInstructions);

        if ((ingredients && ingredients.length > 0) || (instructions && instructions.length > 0)) {
          return {
            ingredients: ingredients || [],
            instructions: instructions || [],
          };
        }
      }
    }
  } catch (e) {
    console.warn('JSON-LD extraction failed:', e);
  }
  return null;
}

function normalizeIngredients(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((x) => (typeof x === 'string' ? x.trim() : ''))
      .filter((x) => x.length > 0);
  }
  if (typeof raw === 'string') {
    // Some sites provide a single string with line breaks
    return raw
      .split(/\r?\n/)
      .map((x) => x.replace(/^[-•\s]+/, '').trim())
      .filter((x) => x.length > 0);
  }
  return [];
}

function normalizeInstructions(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((step: any) => {
        if (typeof step === 'string') return step.trim();
        if (step && typeof step === 'object') {
          // HowToStep or list item
          if (typeof step.text === 'string') return step.text.trim();
          if (typeof step.name === 'string') return step.name.trim();
          if (Array.isArray(step.itemListElement)) {
            return step.itemListElement
              .map((el: any) => (typeof el === 'string' ? el : el?.text || el?.name || ''))
              .map((s: string) => (typeof s === 'string' ? s.trim() : ''))
              .filter((s: string) => s.length > 0)
              .join(' ');
          }
        }
        return '';
      })
      .map((x) => x.replace(/^Step\s*\d+[:.)-]?\s*/i, '').trim())
      .filter((x) => x.length > 0);
  }
  if (typeof raw === 'string') {
    // Split on common delimiters or HTML breaks
    return raw
      .split(/\r?\n+|\.(?=\s+[A-Z]|$)/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

function parseIngredientHeuristic(line: string): { name: string; amount: string; unit: string } {
  let s = (line || '').trim();
  s = s.replace(/^[-•\s]+/, '').trim();

  // Prefer mixed numbers and pure fractions before plain integers to avoid capturing only the integer part
  const amountPattern = /^(?:\d+\s+\d+\/\d+|\d+-\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+|[¼½¾⅓⅔⅛⅜⅝⅞])/;
  const amountMatch = s.match(amountPattern);
  let amount = '';
  if (amountMatch) {
    amount = amountMatch[0].trim();
    s = s.slice(amountMatch[0].length).trim();
  }

  let unit = '';
  const unitMatch = s.match(new RegExp('^(' + UNIT_REGEX.source + ')(?=\\b)', 'i'));
  if (unitMatch) {
    unit = unitMatch[0].trim();
    s = s.slice(unitMatch[0].length).trim();
  }

  const name = s.replace(/^of\s+/i, '').trim();
  return { name, amount, unit };
}

function buildStructuredIngredients(ingredients: string[]): { name: string; amount: string; unit: string }[] {
  return ingredients.map(parseIngredientHeuristic);
}

async function refineIngredientsWithAI(ingredients: string[], openaiApiKey: string): Promise<{ name: string; amount: string; unit: string }[] | null> {
  try {
    if (!openaiApiKey) return null;
    if (!ingredients || ingredients.length === 0) return [];

    const prompt = `You are an expert at parsing cooking ingredients. For each input ingredient string, return a JSON array of objects with exact fields: name, amount, unit. Keep original phrasing in name except quantities/units extracted to amount/unit. Use empty strings for unknown fields. Example input: ["1 1/2 cups all-purpose flour", "2 large eggs"]. Output: [{"name":"all-purpose flour","amount":"1 1/2","unit":"cups"},{"name":"large eggs","amount":"2","unit":""}]\n\nIngredients to parse as JSON array: ${JSON.stringify(ingredients)}`;

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 800,
        messages: [
          { role: 'system', content: 'Return ONLY valid JSON. No code fences. No extra text.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();
    if (!content) return null;
    const jsonText = content.replace(/^```json\n?/i, '').replace(/```\s*$/i, '');
    const parsed = JSON.parse(jsonText);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((x: any) => ({
      name: typeof x?.name === 'string' ? x.name.trim() : '',
      amount: typeof x?.amount === 'string' ? x.amount.trim() : '',
      unit: typeof x?.unit === 'string' ? x.unit.trim() : ''
    }));
  } catch (_e) {
    return null;
  }
}

const UNIT_REGEX = new RegExp(
  String([
    'teaspoon', 'teaspoons', 'tsp', 'tsp.',
    'tablespoon', 'tablespoons', 'tbsp', 'tbsp.',
    'cup', 'cups',
    'ounce', 'ounces', 'oz', 'oz.',
    'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
    'gram', 'grams', 'g', 'g.',
    'kilogram', 'kilograms', 'kg', 'kg.',
    'milliliter', 'milliliters', 'ml', 'ml.',
    'liter', 'liters', 'l', 'l.',
    'pinch', 'pinches', 'dash', 'dashes',
    'clove', 'cloves', 'slice', 'slices', 'package', 'packages', 'can', 'cans',
  ].join('|')),
  'i'
);

// Check if URL is a YouTube video
function isYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)/;
  return youtubeRegex.test(url);
}

// Extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/watch\?.*v=([^&\n?#]+)/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Extract video description from YouTube using oEmbed API
async function extractYouTubeDescription(url: string): Promise<string | null> {
  try {
    const videoId = extractVideoId(url);
    if (!videoId) {
      console.log('Could not extract video ID from URL:', url);
      return null;
    }

    console.log('Extracting description for video ID:', videoId);

    // Use YouTube oEmbed API to get video info
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    
    const response = await fetch(oembedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeExtractor/1.0)'
      }
    });

    if (!response.ok) {
      console.log('oEmbed API failed, trying alternative method');
      return await extractDescriptionAlternative(videoId);
    }

    const data = await response.json();
    const description = data.description || '';
    
    if (description.length < 50) {
      console.log('oEmbed description too short, trying alternative method');
      return await extractDescriptionAlternative(videoId);
    }

    console.log('YouTube description extracted via oEmbed, length:', description.length);
    return description;

  } catch (error) {
    console.error('Error extracting YouTube description:', error);
    return null;
  }
}

// Alternative method: try to extract from YouTube page
async function extractDescriptionAlternative(videoId: string): Promise<string | null> {
  try {
    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    
    const response = await fetch(videoUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      }
    });

    if (!response.ok) {
      console.log('Failed to fetch YouTube page');
      return null;
    }

    const html = await response.text();
    
    // Try to extract description from meta tags or structured data
    const descriptionMatch = html.match(/<meta name="description" content="([^"]+)"/);
    if (descriptionMatch) {
      const description = descriptionMatch[1];
      console.log('YouTube description extracted from meta tag, length:', description.length);
      return description;
    }

    // Try to find description in JSON-LD
    const jsonLdMatch = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/);
    if (jsonLdMatch) {
      try {
        const jsonData = JSON.parse(jsonLdMatch[1]);
        if (jsonData.description) {
          console.log('YouTube description extracted from JSON-LD, length:', jsonData.description.length);
          return jsonData.description;
        }
      } catch (e) {
        console.log('Failed to parse JSON-LD');
      }
    }

    console.log('Could not extract YouTube description');
    return null;

  } catch (error) {
    console.error('Error in alternative YouTube extraction:', error);
    return null;
  }
}