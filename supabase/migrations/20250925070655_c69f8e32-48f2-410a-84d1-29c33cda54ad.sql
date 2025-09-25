-- Create recipes table
CREATE TABLE public.recipes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  rating NUMERIC(2,1) DEFAULT 0 CHECK (rating >= 0 AND rating <= 5),
  tags TEXT[] DEFAULT '{}',
  instructions TEXT[] DEFAULT '{}',
  cook_time INTEGER DEFAULT 0,
  servings INTEGER DEFAULT 1,
  youtube_url TEXT,
  website_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create ingredients table
CREATE TABLE public.ingredients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount TEXT NOT NULL,
  unit TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create comments table
CREATE TABLE public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  rating NUMERIC(2,1) CHECK (rating >= 0 AND rating <= 5),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for public read access (recipes are public)
CREATE POLICY "Recipes are viewable by everyone" ON public.recipes
  FOR SELECT USING (true);

CREATE POLICY "Ingredients are viewable by everyone" ON public.ingredients
  FOR SELECT USING (true);

CREATE POLICY "Comments are viewable by everyone" ON public.comments
  FOR SELECT USING (true);

-- Allow public inserts for now (can be restricted later with authentication)
CREATE POLICY "Anyone can insert recipes" ON public.recipes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert ingredients" ON public.ingredients
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can insert comments" ON public.comments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Anyone can update recipes" ON public.recipes
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can update ingredients" ON public.ingredients
  FOR UPDATE USING (true);

CREATE POLICY "Anyone can delete recipes" ON public.recipes
  FOR DELETE USING (true);

CREATE POLICY "Anyone can delete ingredients" ON public.ingredients
  FOR DELETE USING (true);

CREATE POLICY "Anyone can delete comments" ON public.comments
  FOR DELETE USING (true);

-- Create indexes for better performance
CREATE INDEX idx_ingredients_recipe_id ON public.ingredients(recipe_id);
CREATE INDEX idx_comments_recipe_id ON public.comments(recipe_id);

-- Create trigger function for updating timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for recipes
CREATE TRIGGER update_recipes_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();