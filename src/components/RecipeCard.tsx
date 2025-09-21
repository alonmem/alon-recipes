import { Recipe } from "@/types/recipe";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, Clock, Users, ExternalLink, Youtube } from "lucide-react";

interface RecipeCardProps {
  recipe: Recipe;
  onView: (recipe: Recipe) => void;
}

export const RecipeCard = ({ recipe, onView }: RecipeCardProps) => {
  return (
    <Card className="group overflow-hidden transition-all duration-300 hover:shadow-[var(--shadow-recipe)] cursor-pointer">
      <div onClick={() => onView(recipe)}>
        <CardHeader className="p-0">
          <div className="aspect-video bg-gradient-to-br from-recipe-cream to-accent overflow-hidden">
            {recipe.image ? (
              <img 
                src={recipe.image} 
                alt={recipe.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-recipe-cream to-secondary">
                <div className="text-muted-foreground text-4xl">🍳</div>
              </div>
            )}
          </div>
        </CardHeader>
        
        <CardContent className="p-4">
          <h3 className="font-semibold text-lg mb-2 line-clamp-2 group-hover:text-primary transition-colors">
            {recipe.title}
          </h3>
          <p className="text-muted-foreground text-sm mb-3 line-clamp-2">
            {recipe.description}
          </p>
          
          <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-recipe-gold text-recipe-gold" />
              <span>{recipe.rating}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>{recipe.cookTime}min</span>
            </div>
            <div className="flex items-center gap-1">
              <Users className="w-4 h-4" />
              <span>{recipe.servings}</span>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-1">
            {recipe.tags.slice(0, 3).map((tag) => (
              <Badge key={tag} variant="secondary" className="text-xs">
                {tag}
              </Badge>
            ))}
            {recipe.tags.length > 3 && (
              <Badge variant="outline" className="text-xs">
                +{recipe.tags.length - 3}
              </Badge>
            )}
          </div>
        </CardContent>
      </div>
      
      <CardFooter className="p-4 pt-0 flex gap-2">
        <Button onClick={() => onView(recipe)} className="flex-1">
          View Recipe
        </Button>
        {recipe.youtubeUrl && (
          <Button variant="outline" size="icon" asChild>
            <a href={recipe.youtubeUrl} target="_blank" rel="noopener noreferrer">
              <Youtube className="w-4 h-4" />
            </a>
          </Button>
        )}
        {recipe.websiteUrl && (
          <Button variant="outline" size="icon" asChild>
            <a href={recipe.websiteUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4" />
            </a>
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};