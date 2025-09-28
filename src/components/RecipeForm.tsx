import { useState } from "react";
import { Recipe, Ingredient } from "@/types/recipe";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Plus, X, ArrowLeft, Save, Trash2, Globe } from "lucide-react";
import { RecipeExtractorService } from "@/services/recipeExtractor";
import { useToast } from "@/hooks/use-toast";

interface RecipeFormProps {
  recipe: Recipe;
  onSave: (recipe: Recipe) => void;
  onCancel: () => void;
  onDelete: (recipeId: string) => void;
  isNewRecipe?: boolean;
}

export const RecipeForm = ({ recipe, onSave, onCancel, onDelete, isNewRecipe = false }: RecipeFormProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<Recipe>({
    ...recipe,
    ingredients: [...recipe.ingredients],
    instructions: [...recipe.instructions],
    tags: [...recipe.tags]
  });
  const [newTag, setNewTag] = useState("");
  const [newIngredient, setNewIngredient] = useState({ name: "", amount: "", unit: "" });
  const [newInstruction, setNewInstruction] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);

  const handleSave = () => {
    const updatedRecipe = {
      ...formData,
      updatedAt: new Date()
    };
    onSave(updatedRecipe);
  };

  const addTag = () => {
    if (newTag.trim() && !formData.tags.includes(newTag.trim())) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag.trim()]
      }));
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(tag => tag !== tagToRemove)
    }));
  };

  const addIngredient = () => {
    if (newIngredient.name && newIngredient.amount) {
      const ingredient: Ingredient = {
        id: `ingredient-${Date.now()}`,
        name: newIngredient.name,
        amount: newIngredient.amount,
        unit: newIngredient.unit
      };
      setFormData(prev => ({
        ...prev,
        ingredients: [...prev.ingredients, ingredient]
      }));
      setNewIngredient({ name: "", amount: "", unit: "" });
    }
  };

  const removeIngredient = (ingredientId: string) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.filter(ing => ing.id !== ingredientId)
    }));
  };

  const updateIngredient = (ingredientId: string, field: keyof Ingredient, value: string) => {
    setFormData(prev => ({
      ...prev,
      ingredients: prev.ingredients.map(ing => 
        ing.id === ingredientId ? { ...ing, [field]: value } : ing
      )
    }));
  };

  const addInstruction = () => {
    if (newInstruction.trim()) {
      setFormData(prev => ({
        ...prev,
        instructions: [...prev.instructions, newInstruction.trim()]
      }));
      setNewInstruction("");
    }
  };

  const removeInstruction = (index: number) => {
    setFormData(prev => ({
      ...prev,
      instructions: prev.instructions.filter((_, i) => i !== index)
    }));
  };

  const updateInstruction = (index: number, value: string) => {
    setFormData(prev => ({
      ...prev,
      instructions: prev.instructions.map((inst, i) => 
        i === index ? value : inst
      )
    }));
  };

  const extractFromWebsite = async () => {
    if (!formData.websiteUrl) {
      toast({
        title: "No URL provided",
        description: "Please enter a website URL first",
        variant: "destructive",
      });
      return;
    }

    setIsExtracting(true);
    
    try {
      const result = await RecipeExtractorService.extractFromUrl(formData.websiteUrl);
      
      console.log('Extraction result:', result);
      
      if (result.success) {
        // Update recipe with extracted data
        let updatedFields: string[] = [];

        console.log('Processing extraction results:', {
          instructions: result.instructions?.length,
          ingredients: result.ingredients?.length
        });

        // Add extracted instructions
        if (result.instructions && result.instructions.length > 0) {
          console.log('Adding instructions:', result.instructions);
          setFormData(prev => ({
            ...prev,
            instructions: [...prev.instructions, ...result.instructions!]
          }));
          updatedFields.push(`${result.instructions.length} instructions`);
        }

        // Add extracted ingredients (convert from simple strings to structured format)
        if (result.ingredients && result.ingredients.length > 0) {
          console.log('Adding ingredients:', result.ingredients);
          const newIngredients = result.ingredients.map((ingredient: string) => ({
            id: `ingredient-${Date.now()}-${Math.random()}`,
            name: ingredient, // Keep full description as name since AI formatted it properly
            amount: '', // Amount is included in the name string
            unit: ''   // Unit is included in the name string
          }));
          
          setFormData(prev => ({
            ...prev,
            ingredients: [...prev.ingredients, ...newIngredients]
          }));
          updatedFields.push(`${result.ingredients.length} ingredients`);
        }

        console.log('Updated fields:', updatedFields);

        if (updatedFields.length > 0) {
          toast({
            title: "Recipe extracted successfully!",
            description: `Added: ${updatedFields.join(', ')}`,
          });
        } else {
          toast({
            title: "Extraction completed",
            description: "No new content was found to add to the recipe",
            variant: "destructive"
          });
        }
      } else {
        throw new Error(result.error || 'Failed to extract recipe');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to extract recipe information",
        variant: "destructive",
      });
    } finally {
      setIsExtracting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onCancel} className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Cancel
          </Button>
          {!isNewRecipe && (
            <Button 
              variant="destructive" 
              onClick={() => onDelete(recipe.id)} 
              className="gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Delete Recipe
            </Button>
          )}
        </div>
        <Button onClick={handleSave} className="gap-2">
          <Save className="w-4 h-4" />
          Save Recipe
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column - Basic Info */}
        <div className="space-y-6">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="title">Recipe Title</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter recipe title"
                />
              </div>
              
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe your recipe"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="rating">Rating</Label>
                  <Input
                    id="rating"
                    type="number"
                    min="1"
                    max="5"
                    value={formData.rating}
                    onChange={(e) => setFormData(prev => ({ ...prev, rating: parseInt(e.target.value) || 1 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="cookTime">Cook Time (min)</Label>
                  <Input
                    id="cookTime"
                    type="number"
                    value={formData.cookTime}
                    onChange={(e) => setFormData(prev => ({ ...prev, cookTime: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div>
                  <Label htmlFor="servings">Servings</Label>
                  <Input
                    id="servings"
                    type="number"
                    value={formData.servings}
                    onChange={(e) => setFormData(prev => ({ ...prev, servings: parseInt(e.target.value) || 1 }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Links */}
          <Card>
            <CardHeader>
              <CardTitle>External Links</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="youtubeUrl">YouTube URL</Label>
                <Input
                  id="youtubeUrl"
                  value={formData.youtubeUrl || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, youtubeUrl: e.target.value }))}
                  placeholder="https://youtube.com/watch?v=..."
                />
              </div>
              
              <div>
                <Label htmlFor="websiteUrl">Website URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="websiteUrl"
                    value={formData.websiteUrl || ""}
                    onChange={(e) => setFormData(prev => ({ ...prev, websiteUrl: e.target.value }))}
                    placeholder="https://example.com/recipe"
                    className="flex-1"
                  />
                  <Button 
                    type="button"
                    variant="outline" 
                    onClick={extractFromWebsite}
                    disabled={isExtracting || !formData.websiteUrl}
                    className="gap-2"
                  >
                    <Globe className="w-4 h-4" />
                    {isExtracting ? "Extracting..." : "Extract"}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="image">Image URL</Label>
                <Input
                  id="image"
                  value={formData.image || ""}
                  onChange={(e) => setFormData(prev => ({ ...prev, image: e.target.value }))}
                  placeholder="https://example.com/image.jpg"
                />
              </div>
            </CardContent>
          </Card>

          {/* Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-2">
                    {tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="hover:text-destructive"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Add tag"
                  onKeyPress={(e) => e.key === 'Enter' && addTag()}
                />
                <Button onClick={addTag} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Ingredients & Instructions */}
        <div className="space-y-6">
          {/* Ingredients */}
          <Card>
            <CardHeader>
              <CardTitle>Ingredients</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                {formData.ingredients.map((ingredient) => (
                  <div key={ingredient.id} className="flex gap-2 items-center">
                    <Input
                      value={ingredient.name}
                      onChange={(e) => updateIngredient(ingredient.id, 'name', e.target.value)}
                      placeholder="Ingredient name"
                      className="flex-1"
                    />
                    <Input
                      value={ingredient.amount}
                      onChange={(e) => updateIngredient(ingredient.id, 'amount', e.target.value)}
                      placeholder="Amount"
                      className="w-20"
                    />
                    <Input
                      value={ingredient.unit}
                      onChange={(e) => updateIngredient(ingredient.id, 'unit', e.target.value)}
                      placeholder="Unit"
                      className="w-16"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeIngredient(ingredient.id)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Input
                  value={newIngredient.name}
                  onChange={(e) => setNewIngredient(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Ingredient name"
                  className="flex-1"
                />
                <Input
                  value={newIngredient.amount}
                  onChange={(e) => setNewIngredient(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="Amount"
                  className="w-20"
                />
                <Input
                  value={newIngredient.unit}
                  onChange={(e) => setNewIngredient(prev => ({ ...prev, unit: e.target.value }))}
                  placeholder="Unit"
                  className="w-16"
                />
                <Button onClick={addIngredient} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {formData.instructions.map((instruction, index) => (
                  <div key={index} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground text-sm font-medium rounded-full flex items-center justify-center mt-1">
                      {index + 1}
                    </span>
                    <Textarea
                      value={instruction}
                      onChange={(e) => updateInstruction(index, e.target.value)}
                      rows={2}
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeInstruction(index)}
                      className="mt-1"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Separator />

              <div className="flex gap-2">
                <Textarea
                  value={newInstruction}
                  onChange={(e) => setNewInstruction(e.target.value)}
                  placeholder="Add instruction step"
                  rows={2}
                  className="flex-1"
                />
                <Button onClick={addInstruction} size="sm" className="self-start">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};