import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Recipe } from '@/types/recipe';

export const useRecipes = () => {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch recipes with ingredients and comments
  const fetchRecipes = async () => {
    try {
      setLoading(true);
      
      // Fetch recipes
      const { data: recipesData, error: recipesError } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (recipesError) throw recipesError;

      // Fetch ingredients for all recipes
      const { data: ingredientsData, error: ingredientsError } = await supabase
        .from('ingredients')
        .select('*');

      if (ingredientsError) throw ingredientsError;

      // Fetch comments for all recipes
      const { data: commentsData, error: commentsError } = await supabase
        .from('comments')
        .select('*')
        .order('created_at', { ascending: false });

      if (commentsError) throw commentsError;

      // Combine the data
      const formattedRecipes: Recipe[] = (recipesData || []).map(recipe => ({
        id: recipe.id,
        title: recipe.title,
        description: recipe.description || '',
        image: recipe.image || '',
        rating: Number(recipe.rating) || 0,
        tags: recipe.tags || [],
        ingredients: (ingredientsData || [])
          .filter(ingredient => ingredient.recipe_id === recipe.id)
          .map(ingredient => ({
            id: ingredient.id,
            name: ingredient.name,
            amount: ingredient.amount,
            unit: ingredient.unit
          })),
        instructions: recipe.instructions || [],
        cookTime: recipe.cook_time || 0,
        servings: recipe.servings || 1,
        calories: typeof recipe.calories === 'number' ? recipe.calories : undefined,
        youtubeUrl: recipe.youtube_url || '',
        websiteUrl: recipe.website_url || '',
        comments: (commentsData || [])
          .filter(comment => comment.recipe_id === recipe.id)
          .map(comment => ({
            id: comment.id,
            text: comment.text,
            date: new Date(comment.created_at),
            rating: Number(comment.rating) || undefined
          })),
        createdAt: new Date(recipe.created_at),
        updatedAt: new Date(recipe.updated_at)
      }));

      setRecipes(formattedRecipes);
    } catch (error) {
      console.error('Error fetching recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Save recipe (create or update)
  const saveRecipe = async (recipe: Recipe) => {
    try {
      const isNew = !recipe.id || recipe.id.startsWith('temp-');
      
      if (isNew) {
        // Create new recipe
        const { data: newRecipe, error: recipeError } = await supabase
          .from('recipes')
          .insert({
            title: recipe.title,
            description: recipe.description,
            image: recipe.image,
            rating: recipe.rating,
            tags: recipe.tags,
            instructions: recipe.instructions,
            cook_time: recipe.cookTime,
            servings: recipe.servings,
            youtube_url: recipe.youtubeUrl,
            website_url: recipe.websiteUrl,
            calories: typeof recipe.calories === 'number' ? recipe.calories : null
          })
          .select()
          .single();

        if (recipeError) throw recipeError;

        // Insert ingredients
        if (recipe.ingredients.length > 0) {
          const { error: ingredientsError } = await supabase
            .from('ingredients')
            .insert(
              recipe.ingredients.map(ingredient => ({
                recipe_id: newRecipe.id,
                name: ingredient.name,
                amount: ingredient.amount,
                unit: ingredient.unit
              }))
            );

          if (ingredientsError) throw ingredientsError;
        }
      } else {
        // Update existing recipe
        const { error: recipeError } = await supabase
          .from('recipes')
          .update({
            title: recipe.title,
            description: recipe.description,
            image: recipe.image,
            rating: recipe.rating,
            tags: recipe.tags,
            instructions: recipe.instructions,
            cook_time: recipe.cookTime,
            servings: recipe.servings,
            youtube_url: recipe.youtubeUrl,
            website_url: recipe.websiteUrl,
            calories: typeof recipe.calories === 'number' ? recipe.calories : null
          })
          .eq('id', recipe.id);

        if (recipeError) throw recipeError;

        // Delete existing ingredients and insert new ones
        await supabase.from('ingredients').delete().eq('recipe_id', recipe.id);
        
        if (recipe.ingredients.length > 0) {
          const { error: ingredientsError } = await supabase
            .from('ingredients')
            .insert(
              recipe.ingredients.map(ingredient => ({
                recipe_id: recipe.id,
                name: ingredient.name,
                amount: ingredient.amount,
                unit: ingredient.unit
              }))
            );

          if (ingredientsError) throw ingredientsError;
        }
      }

      await fetchRecipes(); // Refresh the list
    } catch (error) {
      console.error('Error saving recipe:', error);
      throw error;
    }
  };

  // Delete recipe
  const deleteRecipe = async (recipeId: string) => {
    try {
      const { error } = await supabase
        .from('recipes')
        .delete()
        .eq('id', recipeId);

      if (error) throw error;

      await fetchRecipes(); // Refresh the list
    } catch (error) {
      console.error('Error deleting recipe:', error);
      throw error;
    }
  };

  // Add comment to recipe
  const addComment = async (recipeId: string, commentText: string) => {
    try {
      const { error } = await supabase
        .from('comments')
        .insert({
          recipe_id: recipeId,
          text: commentText
        });

      if (error) throw error;

      await fetchRecipes(); // Refresh to get the new comment
    } catch (error) {
      console.error('Error adding comment:', error);
      throw error;
    }
  };

  useEffect(() => {
    fetchRecipes();
  }, []);

  return {
    recipes,
    loading,
    saveRecipe,
    deleteRecipe,
    addComment,
    refetch: fetchRecipes
  };
};