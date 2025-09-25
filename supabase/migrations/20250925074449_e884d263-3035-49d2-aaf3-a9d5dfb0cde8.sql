-- Insert some sample recipes (let the ID be auto-generated)
INSERT INTO public.recipes (title, description, image, rating, tags, instructions, cook_time, servings) VALUES
(
  'Classic Chocolate Chip Cookies', 
  'The perfect chewy chocolate chip cookies that everyone will love',
  'https://images.unsplash.com/photo-1499636136210-6f4ee915583e?w=400',
  4.5,
  ARRAY['dessert', 'cookies', 'baking', 'sweet'],
  ARRAY['Preheat oven to 375°F', 'Mix butter and sugars until creamy', 'Beat in eggs and vanilla', 'Combine flour, baking soda, and salt', 'Gradually mix in dry ingredients', 'Stir in chocolate chips', 'Drop rounded tablespoons onto ungreased cookie sheet', 'Bake 9-11 minutes until golden brown'],
  25,
  24
),
(
  'Margherita Pizza', 
  'A classic Italian pizza with fresh mozzarella, tomatoes, and basil',
  'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400',
  4.8,
  ARRAY['italian', 'pizza', 'vegetarian', 'dinner'],
  ARRAY['Prepare pizza dough', 'Roll out dough on floured surface', 'Spread tomato sauce evenly', 'Add fresh mozzarella slices', 'Bake at 475°F for 12-15 minutes', 'Top with fresh basil leaves', 'Drizzle with olive oil before serving'],
  45,
  4
),
(
  'Beef Tacos', 
  'Delicious ground beef tacos with fresh toppings',
  'https://images.unsplash.com/photo-1565299585323-38174c97c45b?w=400',
  4.2,
  ARRAY['mexican', 'tacos', 'beef', 'dinner'],
  ARRAY['Brown ground beef in large skillet', 'Add taco seasoning and water', 'Simmer until thickened', 'Warm taco shells', 'Fill shells with beef mixture', 'Top with lettuce, cheese, tomatoes', 'Serve with salsa and sour cream'],
  20,
  6
);

-- Insert ingredients for the recipes
INSERT INTO public.ingredients (recipe_id, name, amount, unit) 
SELECT 
  r.id,
  ingredient_data.name,
  ingredient_data.amount,
  ingredient_data.unit
FROM public.recipes r
CROSS JOIN (
  SELECT 'Classic Chocolate Chip Cookies' as recipe_title, 'Butter' as name, '1' as amount, 'cup' as unit
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Brown sugar', '3/4', 'cup'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'White sugar', '1/4', 'cup'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Eggs', '2', 'large'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Vanilla extract', '2', 'tsp'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'All-purpose flour', '2 1/4', 'cups'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Baking soda', '1', 'tsp'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Salt', '1', 'tsp'
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Chocolate chips', '2', 'cups'
  UNION ALL SELECT 'Margherita Pizza', 'Pizza dough', '1', 'ball'
  UNION ALL SELECT 'Margherita Pizza', 'Tomato sauce', '1/2', 'cup'
  UNION ALL SELECT 'Margherita Pizza', 'Fresh mozzarella', '8', 'oz'
  UNION ALL SELECT 'Margherita Pizza', 'Fresh basil', '1/4', 'cup'
  UNION ALL SELECT 'Margherita Pizza', 'Olive oil', '2', 'tbsp'
  UNION ALL SELECT 'Margherita Pizza', 'Salt', '1', 'pinch'
  UNION ALL SELECT 'Margherita Pizza', 'Black pepper', '1', 'pinch'
  UNION ALL SELECT 'Beef Tacos', 'Ground beef', '1', 'lb'
  UNION ALL SELECT 'Beef Tacos', 'Taco seasoning', '1', 'packet'
  UNION ALL SELECT 'Beef Tacos', 'Water', '3/4', 'cup'
  UNION ALL SELECT 'Beef Tacos', 'Taco shells', '12', 'shells'
  UNION ALL SELECT 'Beef Tacos', 'Lettuce', '2', 'cups'
  UNION ALL SELECT 'Beef Tacos', 'Shredded cheese', '1', 'cup'
  UNION ALL SELECT 'Beef Tacos', 'Diced tomatoes', '2', 'medium'
  UNION ALL SELECT 'Beef Tacos', 'Sour cream', '1', 'cup'
  UNION ALL SELECT 'Beef Tacos', 'Salsa', '1', 'cup'
) ingredient_data
WHERE r.title = ingredient_data.recipe_title;

-- Insert sample comments
INSERT INTO public.comments (recipe_id, text, rating)
SELECT 
  r.id,
  comment_data.text,
  comment_data.rating
FROM public.recipes r
CROSS JOIN (
  SELECT 'Classic Chocolate Chip Cookies' as recipe_title, 'These cookies turned out amazing! My family loved them.' as text, 5 as rating
  UNION ALL SELECT 'Classic Chocolate Chip Cookies', 'Perfect recipe, will make again!', 4
  UNION ALL SELECT 'Margherita Pizza', 'Best homemade pizza I''ve ever made. The crust was perfect!', 5
  UNION ALL SELECT 'Beef Tacos', 'Quick and easy weeknight dinner. Kids loved it!', 4
) comment_data
WHERE r.title = comment_data.recipe_title;