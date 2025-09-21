import { Recipe, Comment } from "@/types/recipe";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Star, Clock, Users, ExternalLink, Youtube, ArrowLeft, Edit, MessageSquare, Plus } from "lucide-react";
import { useState } from "react";

interface RecipeDetailProps {
  recipe: Recipe;
  onBack: () => void;
  onEdit: (recipe: Recipe) => void;
  onAddComment: (recipeId: string, comment: string) => void;
}

export const RecipeDetail = ({ recipe, onBack, onEdit, onAddComment }: RecipeDetailProps) => {
  const [newComment, setNewComment] = useState("");
  const [showCommentForm, setShowCommentForm] = useState(false);

  const handleAddComment = () => {
    if (newComment.trim()) {
      onAddComment(recipe.id, newComment);
      setNewComment("");
      setShowCommentForm(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Recipes
        </Button>
        <Button onClick={() => onEdit(recipe)} className="gap-2">
          <Edit className="w-4 h-4" />
          Edit Recipe
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        {/* Left Column - Image & Basic Info */}
        <div className="space-y-6">
          {/* Recipe Image */}
          <div className="aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-recipe-cream to-accent">
            {recipe.image ? (
              <img 
                src={recipe.image} 
                alt={recipe.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="text-muted-foreground text-6xl">🍳</div>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <Card>
            <CardContent className="p-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Star className="w-4 h-4 fill-recipe-gold text-recipe-gold" />
                    <span className="font-semibold">{recipe.rating}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Rating</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Clock className="w-4 h-4" />
                    <span className="font-semibold">{recipe.cookTime}min</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Cook Time</div>
                </div>
                <div>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Users className="w-4 h-4" />
                    <span className="font-semibold">{recipe.servings}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">Servings</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* External Links */}
          {(recipe.youtubeUrl || recipe.websiteUrl) && (
            <Card>
              <CardHeader>
                <h3 className="font-semibold">External Links</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                {recipe.youtubeUrl && (
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <a href={recipe.youtubeUrl} target="_blank" rel="noopener noreferrer">
                      <Youtube className="w-4 h-4" />
                      Watch on YouTube
                    </a>
                  </Button>
                )}
                {recipe.websiteUrl && (
                  <Button variant="outline" className="w-full justify-start gap-2" asChild>
                    <a href={recipe.websiteUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4" />
                      View Original Recipe
                    </a>
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right Column - Recipe Details */}
        <div className="space-y-6">
          {/* Title & Description */}
          <div>
            <h1 className="text-3xl font-bold mb-4">{recipe.title}</h1>
            <p className="text-muted-foreground mb-4">{recipe.description}</p>
            
            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {recipe.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          </div>

          {/* Ingredients */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Ingredients</h2>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {recipe.ingredients.map((ingredient) => (
                  <li key={ingredient.id} className="flex justify-between items-center">
                    <span>{ingredient.name}</span>
                    <span className="text-muted-foreground">
                      {ingredient.amount} {ingredient.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Instructions */}
          <Card>
            <CardHeader>
              <h2 className="text-xl font-semibold">Instructions</h2>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                {recipe.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-3">
                    <span className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground text-sm font-medium rounded-full flex items-center justify-center">
                      {index + 1}
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          {/* Comments Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  My Notes ({recipe.comments.length})
                </h2>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => setShowCommentForm(!showCommentForm)}
                  className="gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Note
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Add Comment Form */}
              {showCommentForm && (
                <div className="mb-4 space-y-3">
                  <Textarea
                    placeholder="Add a note about this recipe..."
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleAddComment} disabled={!newComment.trim()}>
                      Add Note
                    </Button>
                    <Button variant="ghost" onClick={() => {
                      setShowCommentForm(false);
                      setNewComment("");
                    }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Comments List */}
              <div className="space-y-4">
                {recipe.comments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-4">
                    No notes yet. Add your first cooking note!
                  </p>
                ) : (
                  recipe.comments.map((comment) => (
                    <div key={comment.id} className="space-y-2">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>{comment.date.toLocaleDateString()}</span>
                        {comment.rating && (
                          <div className="flex items-center gap-1">
                            <Star className="w-3 h-3 fill-recipe-gold text-recipe-gold" />
                            <span>{comment.rating}</span>
                          </div>
                        )}
                      </div>
                      <p className="text-sm">{comment.text}</p>
                      <Separator />
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};