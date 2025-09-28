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

    // Clean HTML and extract meaningful text for AI analysis
    const cleanedText = cleanHtmlContent(htmlContent);
    
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
              content: `Extract the recipe from this website content:\n\n${cleanedText.substring(0, 12000)}`
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
              content: `Extract the recipe from this website content:\n\n${cleanedText.substring(0, 12000)}`
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
    const result = {
      success: true,
      ingredients: recipeData.ingredients || [],
      instructions: recipeData.instructions || []
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