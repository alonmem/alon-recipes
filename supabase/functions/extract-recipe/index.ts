import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      const aiStructured = await refineIngredientsWithAI(flat, Deno.env.get('OPENAI_API_KEY') || '').catch(() => null);
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

    // Use AI to extract recipe information with comprehensive fallback
    let aiResponse;
    let aiError = null;
    
    // Try models in order of preference (heaviest to lightest)
    const models = [
      'gpt-5-nano-2025-08-07',
      'gpt-4o', 
      'gpt-4o-mini',
      'gpt-3.5-turbo'
    ];
    
    for (const model of models) {
      try {
        console.log(`Trying AI model: ${model}`);
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: model,
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
          })
        });

        if (aiResponse.ok) {
          console.log(`Successfully used AI model: ${model}`);
          break;
        } else {
          const errorText = await aiResponse.text();
          console.error(`${model} API error:`, errorText);
          aiError = errorText;
          
          // If quota exceeded, try next model
          if (errorText.includes('insufficient_quota') || errorText.includes('quota')) {
            console.log(`Quota exceeded for ${model}, trying next model...`);
            continue;
          }
          
          // If other error, try next model
          console.log(`Error with ${model}, trying next model...`);
        }
      } catch (error) {
        console.error(`Error calling ${model}:`, error);
        aiError = error.message;
        continue;
      }
    }

    // If all AI models failed, use heuristic fallback
    if (!aiResponse || !aiResponse.ok) {
      console.log('All AI models failed, using heuristic fallback');
      return await extractRecipeHeuristic(textToAnalyze);
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

    console.log('Returning AI extraction result:', result);
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

// Extract recipe data from JSON-LD structured data
function extractFromJsonLd(html: string): { ingredients: string[]; instructions: string[] } | null {
  try {
    const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>(.*?)<\/script>/gs;
    const matches = html.match(jsonLdRegex);
    
    if (!matches) return null;
    
    for (const match of matches) {
      const jsonContent = match.replace(/<script[^>]*type=["']application\/ld\+json["'][^>]*>/, '').replace(/<\/script>/, '');
      
      try {
        const data = JSON.parse(jsonContent);
        
        // Handle both single objects and arrays
        const recipes = Array.isArray(data) ? data : [data];
        
        for (const recipe of recipes) {
          if (recipe['@type'] === 'Recipe' || recipe.type === 'Recipe') {
            const ingredients = normalizeIngredients(recipe.recipeIngredient || recipe.ingredients || []);
            const instructions = normalizeInstructions(recipe.recipeInstructions || recipe.instructions || []);
            
            if ((ingredients && ingredients.length > 0) || (instructions && instructions.length > 0)) {
              return {
                ingredients: ingredients || [],
                instructions: instructions || []
              };
            }
          }
        }
      } catch (e) {
        console.log('Failed to parse JSON-LD:', e);
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting JSON-LD:', error);
    return null;
  }
}

// Clean HTML content for better AI processing
function cleanHtmlContent(html: string): string {
  // Remove script and style tags
  let cleaned = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  
  // Remove comments
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  
  // Remove navigation and header elements
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  
  // Remove common non-recipe elements
  const removePatterns = [
    /<aside[^>]*>[\s\S]*?<\/aside>/gi,
    /<div[^>]*class="[^"]*(?:ad|advertisement|banner|sidebar|menu|navigation)[^"]*"[^>]*>[\s\S]*?<\/div>/gi,
    /<div[^>]*id="[^"]*(?:ad|advertisement|banner|sidebar|menu|navigation)[^"]*"[^>]*>[\s\S]*?<\/div>/gi
  ];
  
  for (const pattern of removePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Convert HTML entities
  cleaned = cleaned.replace(/&nbsp;/g, ' ');
  cleaned = cleaned.replace(/&amp;/g, '&');
  cleaned = cleaned.replace(/&lt;/g, '<');
  cleaned = cleaned.replace(/&gt;/g, '>');
  cleaned = cleaned.replace(/&quot;/g, '"');
  cleaned = cleaned.replace(/&#39;/g, "'");
  
  // Convert line breaks and clean up whitespace
  cleaned = cleaned.replace(/<br\s*\/?>/gi, '\n');
  cleaned = cleaned.replace(/<\/p>/gi, '\n\n');
  cleaned = cleaned.replace(/<\/div>/gi, '\n');
  cleaned = cleaned.replace(/<\/li>/gi, '\n');
  
  // Remove remaining HTML tags
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\n\s*\n/g, '\n\n');
  cleaned = cleaned.replace(/[ \t]+/g, ' ');
  cleaned = cleaned.trim();
  
  return cleaned;
}

// Normalize ingredients array
function normalizeIngredients(raw: string | string[]): string[] {
  if (!raw) return [];
  
  const ingredients = Array.isArray(raw) ? raw : [raw];
  
  return ingredients
    .map(ing => typeof ing === 'string' ? ing : (ing as any).name || (ing as any).text || '')
    .filter(ing => ing && ing.trim().length > 0)
    .map(ing => ing.trim());
}

// Normalize instructions array
function normalizeInstructions(raw: string | string[] | any[]): string[] {
  if (!raw) return [];
  
  let instructions: string[] = [];
  
  if (Array.isArray(raw)) {
    instructions = raw.map(step => {
      if (typeof step === 'string') {
        return step;
      } else if (step.text) {
        return step.text;
      } else if (step.name) {
        return step.name;
      } else if (step.instruction) {
        return step.instruction;
      }
      return '';
    });
  } else if (typeof raw === 'string') {
    // Split by common delimiters
    instructions = raw
      .split(/\r?\n+|\.(?=\s+[A-Z]|$)/)
      .map(s => s.trim())
      .filter(s => s.length > 0);
  }
  
  return instructions.filter(step => step && step.trim().length > 0);
}

// AI-powered ingredient structuring with fallback
async function refineIngredientsWithAI(ingredients: string[], openaiApiKey: string): Promise<{ name: string; amount: string; unit: string }[] | null> {
  if (!ingredients || ingredients.length === 0) return null;

  const ingredientsList = ingredients.map(ing => `- ${ing}`).join('\n');

  try {
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 1000,
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: `You are an ingredient parsing expert. For each ingredient string, extract the amount, unit, and name. Return ONLY valid JSON in the format: {"structured_ingredients": [{"name": "...", "amount": "...", "unit": "..."}, ...]}. If a field is not present, use an empty string. Combine descriptive parts into the name.`
          },
          {
            role: 'user',
            content: `Structure these ingredients:\n${ingredientsList}`
          }
        ]
      }),
    });

    if (aiResponse.ok) {
      const aiResult = await aiResponse.json();
      const structured = JSON.parse(aiResult.choices[0].message.content).structured_ingredients;
      if (Array.isArray(structured)) {
        return structured.map(s => ({
          name: s.name || '',
          amount: s.amount || '',
          unit: s.unit || ''
        }));
      }
    }
  } catch (e) {
    console.warn('AI ingredient structuring failed, falling back to heuristic:', e);
  }

  return null;
}

// Heuristic ingredient structuring (fallback)
function buildStructuredIngredients(ingredients: string[]): { name: string; amount: string; unit: string }[] {
  if (!ingredients || ingredients.length === 0) return [];

  return ingredients.map(parseIngredientHeuristic);
}

// Parse individual ingredient using heuristic rules
function parseIngredientHeuristic(ingredient: string): { name: string; amount: string; unit: string } {
  if (!ingredient || typeof ingredient !== 'string') {
    return { name: '', amount: '', unit: '' };
  }

  const trimmed = ingredient.trim();
  if (trimmed.length === 0) {
    return { name: '', amount: '', unit: '' };
  }

  // Pattern to match amounts (including fractions, decimals, mixed numbers)
  const amountPattern = /^(\d+\s*\d+\/\d+|\d+\/\d+|\d+\.\d+|\d+|[¼½¾⅓⅔⅛⅜⅝⅞])/;
  const amountMatch = trimmed.match(amountPattern);

  if (!amountMatch) {
    // No amount found, treat entire string as name
    return { name: trimmed, amount: '', unit: '' };
  }

  const amount = amountMatch[1].trim();
  const remaining = trimmed.substring(amountMatch[0].length).trim();

  // Pattern to match units
  const unitPattern = new RegExp(
    `^(${[
      'cup', 'cups', 'c', 'c.',
      'tablespoon', 'tablespoons', 'tbsp', 'tbsp.', 'tbs', 'tbs.',
      'teaspoon', 'teaspoons', 'tsp', 'tsp.', 't', 't.',
      'ounce', 'ounces', 'oz', 'oz.',
      'pound', 'pounds', 'lb', 'lb.', 'lbs', 'lbs.',
      'gram', 'grams', 'g', 'g.',
      'kilogram', 'kilograms', 'kg', 'kg.',
      'milliliter', 'milliliters', 'ml', 'ml.',
      'liter', 'liters', 'l', 'l.',
      'pinch', 'pinches', 'dash', 'dashes',
      'clove', 'cloves', 'slice', 'slices', 'package', 'packages', 'can', 'cans',
    ].join('|')})`,
    'i'
  );

  const unitMatch = remaining.match(unitPattern);

  if (unitMatch) {
    const unit = unitMatch[1];
    const name = remaining.substring(unitMatch[0].length).trim();
    return { name, amount, unit };
  } else {
    // No unit found, treat remaining as name
    return { name: remaining, amount, unit: '' };
  }
}

// Check if URL is a YouTube video
function isYouTubeUrl(url: string): boolean {
  const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|shorts\/|embed\/)|youtu\.be\/)/;
  return youtubeRegex.test(url);
}

// Extract video ID from YouTube URL
function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
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
    let description = data.description || '';
    
    // For YouTube Shorts, if no description, try using the title
    if (!description && data.title) {
      console.log('No description found, using title as fallback:', data.title);
      description = data.title;
    }
    
    // For YouTube Shorts, descriptions are often very short, so lower the threshold
    const minLength = url.includes('/shorts/') ? 5 : 50;
    
    if (description.length < minLength) {
      console.log('oEmbed description/title too short, trying alternative method');
      return await extractDescriptionAlternative(videoId);
    }

    console.log('YouTube description/title extracted via oEmbed, length:', description.length);
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

    // For YouTube Shorts, also try to extract from title and other meta tags
    const titleMatch = html.match(/<title>([^<]+)</);
    if (titleMatch) {
      const title = titleMatch[1].replace(' - YouTube', '').trim();
      if (title.length > 5) { // Lower threshold for YouTube Shorts
        console.log('YouTube title extracted as fallback, length:', title.length);
        return title;
      }
    }

    // For YouTube Shorts, try to extract from video description in the page
    const videoDescriptionMatch = html.match(/"description":"([^"]+)"/);
    if (videoDescriptionMatch) {
      const videoDescription = videoDescriptionMatch[1].replace(/\\n/g, ' ').trim();
      if (videoDescription.length > 10) {
        console.log('YouTube video description extracted from page, length:', videoDescription.length);
        return videoDescription;
      }
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

// Heuristic fallback for recipe extraction when AI fails
async function extractRecipeHeuristic(content: string): Promise<Response> {
  console.log('Using heuristic recipe extraction fallback');
  
  try {
    // Simple heuristic extraction
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    const ingredients: string[] = [];
    const instructions: string[] = [];
    
    let inIngredients = false;
    let inInstructions = false;
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Detect ingredients section
      if (lowerLine.includes('ingredients') || lowerLine.includes('ingredient')) {
        inIngredients = true;
        inInstructions = false;
        continue;
      }
      
      // Detect instructions section
      if (lowerLine.includes('instructions') || lowerLine.includes('directions') || 
          lowerLine.includes('method') || lowerLine.includes('steps')) {
        inInstructions = true;
        inIngredients = false;
        continue;
      }
      
      // Skip headers and empty lines
      if (line.length < 3 || lowerLine.includes('recipe') || lowerLine.includes('serves')) {
        continue;
      }
      
      // Add to ingredients if in ingredients section
      if (inIngredients && !inInstructions) {
        // Look for common ingredient patterns
        if (line.match(/\d+/) || lowerLine.includes('cup') || lowerLine.includes('tbsp') || 
            lowerLine.includes('tsp') || lowerLine.includes('ounce') || lowerLine.includes('pound')) {
          ingredients.push(line);
        }
      }
      
      // Add to instructions if in instructions section
      if (inInstructions && !inIngredients) {
        // Look for step patterns
        if (line.match(/^\d+\./) || line.match(/^step/i) || line.match(/^[a-z]\)/i)) {
          instructions.push(line);
        }
      }
    }
    
    // If no structured sections found, try to extract from any lines
    if (ingredients.length === 0 && instructions.length === 0) {
      for (const line of lines) {
        // Look for ingredient-like patterns
        if (line.match(/\d+\s*(cup|tbsp|tsp|ounce|pound|gram|kg|ml|l|pinch|dash)/i)) {
          ingredients.push(line);
        }
        // Look for instruction-like patterns
        else if (line.match(/(mix|add|heat|bake|cook|stir|chop|dice|slice|boil|fry|roast|blend|whisk|fold|sauté|simmer|grill|steam)/i)) {
          instructions.push(line);
        }
        // For very short content (like YouTube Shorts), be more aggressive
        else if (line.length > 5 && line.length < 200) {
          // If it looks like a cooking instruction, add it
          if (line.match(/(ingredient|recipe|cooking|food|dish|meal|soup|carrot|ginger)/i)) {
            instructions.push(line);
          }
        }
      }
    }
    
    // Special handling for YouTube Shorts - if we have a title but no other content,
    // try to extract recipe information from the title itself
    if (ingredients.length === 0 && instructions.length === 0 && content.length < 500) {
      console.log('Very short content detected, trying to extract from title/description');
      
      // Look for recipe-related keywords in the content
      const recipeKeywords = /(soup|stew|curry|pasta|salad|bread|cake|cookie|pie|pizza|burger|sandwich|rice|noodle|sauce|dressing|marinade|seasoning|spice|herb|vegetable|meat|chicken|beef|fish|seafood|dairy|cheese|milk|cream|butter|oil|flour|sugar|salt|pepper|garlic|onion|tomato|carrot|ginger|potato|broccoli|spinach|lettuce|basil|oregano|thyme|rosemary|parsley|cilantro)/gi;
      const matches = content.match(recipeKeywords);
      
      if (matches && matches.length > 0) {
        // If we found recipe keywords, treat the entire content as a recipe instruction
        instructions.push(content);
        console.log('Added content as recipe instruction based on keywords');
      }
    }
    
    // Build structured ingredients using heuristic
    const structuredIngredients = buildStructuredIngredients(ingredients);
    
    const result = {
      success: true,
      ingredients: ingredients,
      instructions: instructions,
      structuredIngredients: structuredIngredients
    };
    
    console.log('Heuristic extraction result:', result);
    
    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Heuristic extraction failed:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Failed to extract recipe using heuristic method'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
}