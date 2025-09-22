import { useState, useMemo } from "react";
import { Recipe } from "@/types/recipe";
import { mockRecipes } from "@/data/mockRecipes";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeSearch } from "@/components/RecipeSearch";
import { RecipeDetail } from "@/components/RecipeDetail";
import { RecipeForm } from "@/components/RecipeForm";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import heroImage from "@/assets/recipe-hero.jpg";
const Index = () => {
  const [recipes, setRecipes] = useState<Recipe[]>(mockRecipes);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null);
  const [editingRecipe, setEditingRecipe] = useState<Recipe | null>(null);

  // Get all available tags from recipes
  const availableTags = useMemo(() => {
    const allTags = recipes.flatMap(recipe => recipe.tags);
    return Array.from(new Set(allTags)).sort();
  }, [recipes]);

  // Filter recipes based on search and tags
  const filteredRecipes = useMemo(() => {
    return recipes.filter(recipe => {
      const matchesSearch = recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) || recipe.description.toLowerCase().includes(searchQuery.toLowerCase()) || recipe.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => recipe.tags.includes(tag));
      return matchesSearch && matchesTags;
    });
  }, [recipes, searchQuery, selectedTags]);
  const handleAddComment = (recipeId: string, commentText: string) => {
    setRecipes(prev => prev.map(recipe => {
      if (recipe.id === recipeId) {
        const newComment = {
          id: `comment-${Date.now()}`,
          text: commentText,
          date: new Date()
        };
        return {
          ...recipe,
          comments: [...recipe.comments, newComment]
        };
      }
      return recipe;
    }));

    // Update selected recipe if it's currently viewed
    if (selectedRecipe?.id === recipeId) {
      const updatedRecipe = recipes.find(r => r.id === recipeId);
      if (updatedRecipe) {
        const newComment = {
          id: `comment-${Date.now()}`,
          text: commentText,
          date: new Date()
        };
        setSelectedRecipe({
          ...updatedRecipe,
          comments: [...updatedRecipe.comments, newComment]
        });
      }
    }
  };
  const handleEditRecipe = (recipe: Recipe) => {
    setEditingRecipe(recipe);
    setSelectedRecipe(null);
  };

  const handleSaveRecipe = (updatedRecipe: Recipe) => {
    if (recipes.find(r => r.id === updatedRecipe.id)) {
      // Existing recipe - update
      setRecipes(prev => prev.map(recipe => 
        recipe.id === updatedRecipe.id ? updatedRecipe : recipe
      ));
    } else {
      // New recipe - add
      setRecipes(prev => [...prev, updatedRecipe]);
    }
    setEditingRecipe(null);
  };

  const handleDeleteRecipe = (recipeId: string) => {
    setRecipes(prev => prev.filter(recipe => recipe.id !== recipeId));
    setEditingRecipe(null);
  };

  const handleCreateRecipe = () => {
    const newRecipe: Recipe = {
      id: `recipe-${Date.now()}`,
      title: "",
      description: "",
      rating: 0,
      tags: [],
      ingredients: [],
      instructions: [],
      cookTime: 0,
      servings: 1,
      comments: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
    setEditingRecipe(newRecipe);
  };
  if (editingRecipe) {
    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <RecipeForm 
            recipe={editingRecipe} 
            onSave={handleSaveRecipe} 
            onCancel={() => setEditingRecipe(null)}
            onDelete={handleDeleteRecipe}
            isNewRecipe={!recipes.find(r => r.id === editingRecipe.id)}
          />
        </div>
      </div>
    );
  }

  if (selectedRecipe) {
    return <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <RecipeDetail recipe={selectedRecipe} onBack={() => setSelectedRecipe(null)} onEdit={handleEditRecipe} onAddComment={handleAddComment} />
        </div>
      </div>;
  }
  return <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="relative h-[400px] overflow-hidden">
        <img src={heroImage} alt="Recipe Collection Hero" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-recipe-brown/80 to-recipe-brown/40" />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-white space-y-4">
            <h1 className="text-4xl md:text-5xl font-bold">Alon's Recipe Collection</h1>
            <p className="text-lg md:text-xl text-white/90 max-w-2xl">My favorite recipes with personal notes and ratings</p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-8 space-y-8">
        {/* Search and Filter Section */}
        <div className="bg-card rounded-lg p-6 shadow-[var(--shadow-card)]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-semibold">Browse Recipes</h2>
            <Button onClick={handleCreateRecipe} className="gap-2">
              <Plus className="w-4 h-4" />
              Add Recipe
            </Button>
          </div>
          
          <RecipeSearch onSearch={setSearchQuery} onTagFilter={setSelectedTags} availableTags={availableTags} selectedTags={selectedTags} />
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium">
            {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''} found
          </h3>
        </div>

        {/* Recipe Grid */}
        {filteredRecipes.length === 0 ? <div className="text-center py-12">
            <div className="text-6xl mb-4">🔍</div>
            <h3 className="text-xl font-semibold mb-2">No recipes found</h3>
            <p className="text-muted-foreground">
              Try adjusting your search terms or filters
            </p>
          </div> : <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredRecipes.map(recipe => <RecipeCard key={recipe.id} recipe={recipe} onView={setSelectedRecipe} />)}
          </div>}
      </div>
    </div>;
};
export default Index;