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

    // Clean HTML and extract meaningful text
    const cleanedText = cleanHtmlContent(htmlContent);
    
    // Use OpenAI to extract recipe information
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Sending content to OpenAI for analysis...');

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

Rules:
- Extract ALL cooking steps in logical order
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
      image: recipeData.image || null
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