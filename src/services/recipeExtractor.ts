import { supabase } from '@/integrations/supabase/client';

interface StructuredIngredient { name: string; amount: string; unit: string }

interface RecipeExtractionResult {
  success: boolean;
  instructions?: string[];
  ingredients?: string[];
  structuredIngredients?: StructuredIngredient[];
  error?: string;
}

interface CaloriesCalculationResult {
  success: boolean;
  calories?: number;
  error?: string;
}

export class RecipeExtractorService {
  static async extractFromUrl(url: string): Promise<RecipeExtractionResult> {
    try {
      console.log('Extracting recipe from URL:', url);
      
      // Use our Supabase Edge Function for AI-powered extraction
      const { data, error } = await supabase.functions.invoke('extract-recipe', {
        body: { url }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to extract recipe');
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Failed to extract recipe data');
      }

      console.log('Recipe extraction successful:', data);

      return {
        success: true,
        instructions: data.instructions || [],
        ingredients: data.ingredients || [],
        structuredIngredients: data.structuredIngredients || []
      };
    } catch (error) {
      console.error('Error extracting recipe from URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract recipe'
      };
    }
  }

  static async calculateCalories(ingredients: { name: string; amount: string; unit: string }[]): Promise<CaloriesCalculationResult> {
    try {
      console.log('Calculating calories for ingredients:', ingredients);
      
      // Use our Supabase Edge Function for AI-powered calorie calculation
      const { data, error } = await supabase.functions.invoke('calculate-calories', {
        body: { ingredients }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Failed to calculate calories');
      }

      if (!data || !data.success) {
        throw new Error(data?.error || 'Failed to calculate calories');
      }

      console.log('Calorie calculation successful:', data);

      return {
        success: true,
        calories: data.calories
      };
    } catch (error) {
      console.error('Error calculating calories:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to calculate calories'
      };
    }
  }

}