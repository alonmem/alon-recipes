-- Add table to track processed recipe URLs from Google Sheets
CREATE TABLE IF NOT EXISTS public.imported_recipe_urls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  recipe_id UUID REFERENCES public.recipes(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.imported_recipe_urls ENABLE ROW LEVEL SECURITY;

-- Allow anyone to view and insert (for automated imports)
CREATE POLICY "Anyone can view imported URLs"
  ON public.imported_recipe_urls
  FOR SELECT
  USING (true);

CREATE POLICY "Anyone can insert imported URLs"
  ON public.imported_recipe_urls
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update imported URLs"
  ON public.imported_recipe_urls
  FOR UPDATE
  USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_imported_recipe_urls_url ON public.imported_recipe_urls(url);
CREATE INDEX IF NOT EXISTS idx_imported_recipe_urls_status ON public.imported_recipe_urls(status);