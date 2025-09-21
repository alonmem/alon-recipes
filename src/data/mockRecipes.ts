import { Recipe } from "@/types/recipe";

export const mockRecipes: Recipe[] = [
  {
    id: "1",
    title: "Classic Spaghetti Carbonara",
    description: "Authentic Italian carbonara with eggs, cheese, pancetta, and black pepper.",
    rating: 5,
    tags: ["Italian", "Pasta", "Quick", "Comfort Food"],
    ingredients: [
      { id: "1", name: "Spaghetti", amount: "400", unit: "g" },
      { id: "2", name: "Pancetta", amount: "200", unit: "g" },
      { id: "3", name: "Eggs", amount: "4", unit: "large" },
      { id: "4", name: "Parmesan cheese", amount: "100", unit: "g" },
      { id: "5", name: "Black pepper", amount: "1", unit: "tsp" },
    ],
    instructions: [
      "Cook spaghetti according to package directions.",
      "Fry pancetta until crispy.",
      "Whisk eggs with grated Parmesan.",
      "Combine hot pasta with pancetta, then add egg mixture off heat.",
      "Toss quickly to create creamy sauce. Season with black pepper."
    ],
    cookTime: 20,
    servings: 4,
    youtubeUrl: "https://youtube.com/watch?v=example1",
    comments: [
      { id: "1", text: "Turned out perfectly! The key is to add the eggs off the heat.", date: new Date("2024-01-15"), rating: 5 }
    ],
    createdAt: new Date("2024-01-10"),
    updatedAt: new Date("2024-01-15")
  },
  {
    id: "2", 
    title: "Thai Green Curry",
    description: "Fragrant and spicy Thai curry with coconut milk, vegetables, and fresh herbs.",
    rating: 4,
    tags: ["Thai", "Curry", "Spicy", "Vegetarian", "Healthy"],
    ingredients: [
      { id: "6", name: "Green curry paste", amount: "3", unit: "tbsp" },
      { id: "7", name: "Coconut milk", amount: "400", unit: "ml" },
      { id: "8", name: "Thai eggplant", amount: "200", unit: "g" },
      { id: "9", name: "Bell peppers", amount: "2", unit: "medium" },
      { id: "10", name: "Thai basil", amount: "1", unit: "cup" },
    ],
    instructions: [
      "Heat curry paste in a large pan.",
      "Add thick coconut milk and bring to a simmer.",
      "Add vegetables and cook until tender.",
      "Stir in remaining coconut milk and Thai basil.",
      "Serve with jasmine rice."
    ],
    cookTime: 25,
    servings: 3,
    websiteUrl: "https://example.com/thai-curry",
    comments: [
      { id: "2", text: "Added extra vegetables - delicious!", date: new Date("2024-02-01") }
    ],
    createdAt: new Date("2024-01-20"),
    updatedAt: new Date("2024-02-01")
  },
  {
    id: "3",
    title: "Homemade Pizza Margherita", 
    description: "Classic Neapolitan pizza with fresh mozzarella, tomatoes, and basil.",
    rating: 5,
    tags: ["Italian", "Pizza", "Vegetarian", "Weekend Project"],
    ingredients: [
      { id: "11", name: "Pizza dough", amount: "1", unit: "ball" },
      { id: "12", name: "San Marzano tomatoes", amount: "400", unit: "g" },
      { id: "13", name: "Fresh mozzarella", amount: "250", unit: "g" },
      { id: "14", name: "Fresh basil", amount: "10", unit: "leaves" },
      { id: "15", name: "Olive oil", amount: "2", unit: "tbsp" },
    ],
    instructions: [
      "Preheat oven to maximum temperature with pizza stone.",
      "Roll out pizza dough thinly.",
      "Spread crushed tomatoes, leaving border for crust.",
      "Add torn mozzarella and drizzle with olive oil.",
      "Bake for 8-10 minutes until crust is golden.",
      "Top with fresh basil leaves."
    ],
    cookTime: 15,
    servings: 2,
    comments: [],
    createdAt: new Date("2024-02-05"),
    updatedAt: new Date("2024-02-05")
  }
];