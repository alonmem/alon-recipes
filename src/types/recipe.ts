export interface Recipe {
  id: string;
  title: string;
  description: string;
  image?: string;
  rating: number;
  tags: string[];
  ingredients: Ingredient[];
  instructions: string[];
  cookTime: number;
  servings: number;
  calories?: number;
  websiteUrl?: string; // Single URL field for all types (YouTube, websites, etc.)
  comments: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Ingredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
}

export interface Comment {
  id: string;
  text: string;
  date: Date;
  rating?: number;
}