import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CaloriesCalculationResult {
  success: boolean;
  calories?: number;
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ingredients } = await req.json();
    
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error('Ingredients array is required');
    }

    console.log('Calculating calories for ingredients:', ingredients);

    // Get OpenAI API key
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Prepare ingredients list for AI
    const ingredientsList = ingredients.map(ing => 
      `${ing.amount} ${ing.unit} ${ing.name}`.trim()
    ).join('\n');

    console.log('Sending ingredients to AI for calorie calculation...');

    // Use AI to calculate calories per 100g
    const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.1,
        max_tokens: 200,
        messages: [
          {
            role: 'system',
            content: `You are a nutrition expert. Calculate the total calories per 100g for the given recipe ingredients. Consider typical cooking methods and ingredient densities. Return ONLY a number (no text, no units, no explanation).`
          },
          {
            role: 'user',
            content: `Calculate calories per 100g for these ingredients:\n\n${ingredientsList}`
          }
        ]
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiResult = await aiResponse.json();
    const caloriesText = aiResult.choices[0].message.content.trim();
    console.log('AI calorie calculation result:', caloriesText);

    // Parse the calories number
    const calories = parseFloat(caloriesText.replace(/[^\d.]/g, ''));
    
    if (isNaN(calories) || calories < 0) {
      throw new Error('Invalid calorie calculation result from AI');
    }

    const result: CaloriesCalculationResult = {
      success: true,
      calories: Math.round(calories)
    };

    console.log('Calorie calculation successful:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in calculate-calories function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate calories'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
