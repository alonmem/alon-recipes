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

    // Try primary model first (gpt-4o-mini)
    let aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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

    // If primary model fails, try lighter model (gpt-3.5-turbo)
    if (!aiResponse.ok) {
      console.log('Primary model failed, trying lighter model (gpt-3.5-turbo)...');
      
      aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          temperature: 0.1,
          max_tokens: 100,
          messages: [
            {
              role: 'system',
              content: `Calculate calories per 100g for recipe ingredients. Return only a number.`
            },
            {
              role: 'user',
              content: `Calories per 100g for: ${ingredientsList}`
            }
          ]
        })
      });
    }

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('Both AI models failed:', errorText);
      
      if (aiResponse.status === 429) {
        throw new Error('Rate limit exceeded. Please try again in a few minutes.');
      } else if (aiResponse.status === 401) {
        throw new Error('Invalid API key. Please check your OpenAI configuration.');
      } else {
        throw new Error(`AI API error: ${aiResponse.status}. Please try again later.`);
      }
    }

    const aiResult = await aiResponse.json();
    const caloriesText = aiResult.choices[0].message.content.trim();
    console.log('AI calorie calculation result:', caloriesText);

    // Parse the calories number
    const calories = parseFloat(caloriesText.replace(/[^\d.]/g, ''));
    
    if (isNaN(calories) || calories < 0) {
      // Fallback: estimate calories based on common ingredients
      console.log('AI returned invalid result, using fallback estimation');
      const estimatedCalories = estimateCaloriesFallback(ingredients);
      const result: CaloriesCalculationResult = {
        success: true,
        calories: estimatedCalories
      };
      
      console.log('Fallback calorie calculation:', result);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    
    // If AI fails, try fallback estimation
    try {
      const estimatedCalories = estimateCaloriesFallback(ingredients);
      const result: CaloriesCalculationResult = {
        success: true,
        calories: estimatedCalories
      };
      
      console.log('Fallback calorie calculation after error:', result);
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } catch (fallbackError) {
      console.error('Fallback calculation also failed:', fallbackError);
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
  }
});

// Fallback calorie estimation based on common ingredients
function estimateCaloriesFallback(ingredients: { name: string; amount: string; unit: string }[]): number {
  const calorieMap: { [key: string]: number } = {
    // Common ingredients with calories per 100g
    'flour': 364, 'sugar': 387, 'butter': 717, 'oil': 884, 'milk': 42, 'egg': 155,
    'cheese': 113, 'chicken': 165, 'beef': 250, 'pork': 242, 'fish': 206,
    'rice': 130, 'pasta': 131, 'bread': 265, 'potato': 77, 'onion': 40,
    'tomato': 18, 'carrot': 41, 'broccoli': 34, 'spinach': 23, 'mushroom': 22,
    'garlic': 149, 'ginger': 80, 'lemon': 29, 'apple': 52, 'banana': 89,
    'salt': 0, 'pepper': 251, 'herbs': 0, 'spices': 0
  };
  
  let totalCalories = 0;
  let totalWeight = 0;
  
  for (const ingredient of ingredients) {
    const name = ingredient.name.toLowerCase();
    const amount = parseFloat(ingredient.amount) || 0;
    const unit = ingredient.unit.toLowerCase();
    
    // Convert to grams for calculation
    let weightInGrams = 0;
    if (unit.includes('cup')) {
      weightInGrams = amount * 120; // Approximate weight of 1 cup
    } else if (unit.includes('tbsp') || unit.includes('tablespoon')) {
      weightInGrams = amount * 15;
    } else if (unit.includes('tsp') || unit.includes('teaspoon')) {
      weightInGrams = amount * 5;
    } else if (unit.includes('oz') || unit.includes('ounce')) {
      weightInGrams = amount * 28.35;
    } else if (unit.includes('lb') || unit.includes('pound')) {
      weightInGrams = amount * 453.59;
    } else if (unit.includes('g') || unit.includes('gram')) {
      weightInGrams = amount;
    } else if (unit.includes('kg') || unit.includes('kilogram')) {
      weightInGrams = amount * 1000;
    } else {
      // Default assumption: 100g per ingredient
      weightInGrams = 100;
    }
    
    // Find matching ingredient
    let caloriesPer100g = 100; // Default fallback
    for (const [key, value] of Object.entries(calorieMap)) {
      if (name.includes(key)) {
        caloriesPer100g = value;
        break;
      }
    }
    
    const ingredientCalories = (caloriesPer100g * weightInGrams) / 100;
    totalCalories += ingredientCalories;
    totalWeight += weightInGrams;
  }
  
  // Return calories per 100g
  return totalWeight > 0 ? Math.round((totalCalories * 100) / totalWeight) : 200;
}
