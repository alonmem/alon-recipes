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

    console.log('Sending content to OpenAI for analysis...');

    // Try GPT-5 Nano via Responses API first
    try {
      const gpt5Response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-5-nano-2025-08-07',
          // Newer models use max_completion_tokens and do not support temperature
          max_completion_tokens: 2000,
          input: `You are a recipe extraction expert. Extract recipe information from website content and return ONLY valid JSON with this exact structure:\n\n{\n  "title": "Recipe Name",\n  "description": "Brief description",\n  "ingredients": [\n    {"name": "ingredient name", "amount": "quantity", "unit": "measurement unit"}\n  ],\n  "instructions": ["step 1", "step 2", "step 3"],\n  "cookTime": 30,\n  "servings": 4,\n  "image": "image_url_if_found_or_null"\n}\n\nRules:\n- Extract ALL cooking steps in logical order\n- Include ALL ingredients with proper measurements\n- Convert fractions to decimals (e.g., "1/2" -> "0.5")\n- Use standard units: cups, tsp, tbsp, oz, lbs, g, kg, ml, l, pieces, cloves\n- cookTime in minutes, servings as number\n- If no clear recipe found, return {"error": "No recipe found"}\n- Return ONLY the JSON, no other text\n\nExtract the recipe from this website content:\n\n${cleanedText.substring(0, 8000)}`,
        }),
      });

      if (gpt5Response.ok) {
        const gpt5Data = await gpt5Response.json();
        // Try multiple known shapes to extract text content
        const extractedContent = gpt5Data.output_text
          || gpt5Data?.choices?.[0]?.message?.content
          || gpt5Data?.data?.[0]?.content?.[0]?.text
          || '';
        if (!extractedContent) {
          throw new Error('No content returned by GPT-5 Nano');
        }

        // Parse the JSON response
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
      } else {
        const errorText = await gpt5Response.text();
        console.error('GPT-5 Nano API error:', errorText);
        if (gpt5Response.status === 429) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.code === 'insufficient_quota') {
              console.log('GPT-5 Nano quota exceeded, falling back');
              const fallbackResult = basicRecipeExtraction(cleanedText);
              return new Response(
                JSON.stringify(fallbackResult),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
              );
            }
          } catch (_) {}
        }
        // Continue to legacy model fallback
      }
    } catch (e) {
      console.error('Error calling GPT-5 Nano:', e);
      // Continue to legacy model fallback
    }

    // Legacy fallback: Chat Completions (gpt-4o)
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
            content: `You are a recipe extraction expert. Extract recipe information from website content and return ONLY valid JSON with this exact structure:\n\n{\n  "title": "Recipe Name",\n  "description": "Brief description",\n  "ingredients": [\n    {"name": "ingredient name", "amount": "quantity", "unit": "measurement unit"}\n  ],\n  "instructions": ["step 1", "step 2", "step 3"],\n  "cookTime": 30,\n  "servings": 4,\n  "image": "image_url_if_found_or_null"\n}\n\nRules:\n- Extract ALL cooking steps in logical order\n- Include ALL ingredients with proper measurements\n- Convert fractions to decimals (e.g., "1/2" -> "0.5")\n- Use standard units: cups, tsp, tbsp, oz, lbs, g, kg, ml, l, pieces, cloves\n- cookTime in minutes, servings as number\n- If no clear recipe found, return {"error": "No recipe found"}\n- Return ONLY the JSON, no other text`
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
        const errorData = JSON.parse(errorText);
        if (errorData.error?.code === 'insufficient_quota') {
          console.log('OpenAI quota exceeded, falling back to basic extraction');
          // Fall back to basic HTML parsing
          const fallbackResult = basicRecipeExtraction(cleanedText);
          return new Response(
            JSON.stringify(fallbackResult),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
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
  
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.replace(/\n\s*\n/g, '\n');
  
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
  
  // Look for numbered instructions or action words
  const instructionKeywords = [
    'heat', 'cook', 'bake', 'fry', 'boil', 'simmer', 'mix', 'stir', 'add', 
    'combine', 'whisk', 'blend', 'chop', 'dice', 'slice', 'melt', 'pour',
    'season', 'serve', 'preheat', 'remove', 'transfer', 'cover', 'prepare',
    'place', 'drain', 'rinse', 'cut', 'wash', 'peel', 'grate', 'sprinkle'
  ];

  // More flexible ingredient detection
  const ingredientPatterns = [
    // Pattern like "2 cups flour" or "1 tablespoon olive oil"
    /(\d+(?:[\/\.\d]*)?)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|pieces?|slices?)\s+(?:of\s+)?([^,\n\(]+)/gi,
    // Pattern like "flour - 2 cups" 
    /([a-zA-Z\s]+)\s*[-–]\s*(\d+(?:[\/\.\d]*)?)\s*(cups?|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|pieces?|slices?)/gi,
    // Pattern like "2 large eggs" or "1 medium onion"
    /(\d+(?:[\/\.\d]*)?)\s*(large|medium|small|whole|fresh)?\s*([a-zA-Z\s]+?)(?=\n|$|,|\()/gi
  ];

  let foundIngredientsCount = 0;
  let foundInstructionsCount = 0;

  // Process each line
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lowerLine = line.toLowerCase();
    
    // Skip very long lines (likely paragraphs) and very short ones
    if (line.length < 5 || line.length > 200) continue;
    
    // Try to extract ingredients using multiple patterns
    ingredientPatterns.forEach(pattern => {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null && foundIngredientsCount < 20) {
        let amount = '', unit = '', name = '';
        
        // Different patterns have different capture groups
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
        
        // Clean up the name
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
    
    // Try to extract instructions
    const isNumberedStep = /^\d+[\.\)]\s*/.test(line);
    const hasInstructionWords = instructionKeywords.some(keyword => lowerLine.includes(keyword));
    const isReasonableLength = line.length >= 15 && line.length <= 200;
    const hasActionStructure = /\b(heat|cook|add|mix|stir|place|put|combine|whisk)\b.*\b(until|for|to|in|with|and)\b/i.test(line);
    
    if ((isNumberedStep || hasInstructionWords || hasActionStructure) && 
        isReasonableLength && 
        foundInstructionsCount < 15) {
      
      const cleanInstruction = line
        .replace(/^\d+[\.\)]\s*/, '') // Remove numbering
        .replace(/^[-•*]\s*/, '') // Remove bullet points
        .trim();
      
      if (cleanInstruction.length > 10 && 
          !instructions.some(existing => existing.toLowerCase() === cleanInstruction.toLowerCase())) {
        instructions.push(cleanInstruction);
        foundInstructionsCount++;
      }
    }
  }

  // Try to extract title - look for lines that could be titles
  let title = '';
  for (const line of lines.slice(0, 20)) {
    if (line.length > 10 && line.length < 80 && 
        /^[A-Z]/.test(line) && 
        !line.includes('•') &&
        !line.includes('–') &&
        !line.includes('Recipe') &&
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
    description: 'Recipe extracted using fallback method (OpenAI quota exceeded)',
    instructions: instructions,
    ingredients: ingredients,
    cookTime: 0,
    servings: 1,
    image: undefined
  };
}