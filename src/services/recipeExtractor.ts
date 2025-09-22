interface RecipeExtractionResult {
  success: boolean;
  instructions?: string[];
  ingredients?: Array<{ name: string; amount: string; unit: string }>;
  error?: string;
}

export class RecipeExtractorService {
  static async extractFromUrl(url: string): Promise<RecipeExtractionResult> {
    try {
      // First, let's try to get the content using a more reliable method
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch website content');
      }

      const data = await response.json();
      let htmlContent = data.contents;

      // Clean and extract meaningful text
      const cleanText = this.extractCleanText(htmlContent);
      
      // Use AI-powered extraction
      const extractedData = await this.aiExtractRecipe(cleanText, url);
      
      return {
        success: true,
        instructions: extractedData.instructions,
        ingredients: extractedData.ingredients
      };
    } catch (error) {
      console.error('Error extracting recipe from URL:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract recipe'
      };
    }
  }

  private static extractCleanText(htmlContent: string): string {
    // Parse HTML and extract meaningful content
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    
    // Remove unwanted elements
    const unwantedSelectors = [
      'script', 'style', 'nav', 'header', 'footer', 
      '.advertisement', '.ad', '.sidebar', '.comments',
      '.social-share', '.newsletter', '.popup'
    ];
    
    unwantedSelectors.forEach(selector => {
      const elements = doc.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    });

    // Look for recipe-specific content first
    const recipeSelectors = [
      '[itemtype*="Recipe"]',
      '.recipe',
      '.recipe-content',
      '.recipe-instructions',
      '.recipe-ingredients',
      '.instructions',
      '.ingredients',
      '.method',
      '.directions'
    ];

    let recipeText = '';
    for (const selector of recipeSelectors) {
      const elements = doc.querySelectorAll(selector);
      if (elements.length > 0) {
        elements.forEach(el => {
          recipeText += el.textContent + '\n\n';
        });
      }
    }

    // If no specific recipe content found, get main content
    if (!recipeText.trim()) {
      const mainContent = doc.querySelector('main') || doc.querySelector('article') || doc.body;
      recipeText = mainContent?.textContent || '';
    }

    return recipeText.trim();
  }

  private static async aiExtractRecipe(content: string, url: string): Promise<{
    instructions: string[];
    ingredients: Array<{ name: string; amount: string; unit: string }>;
  }> {
    // Use a structured approach to extract recipe information
    const prompt = `
You are a recipe extraction expert. Extract the recipe information from the following text content from ${url}.

Please extract:
1. A numbered list of cooking instructions/steps
2. A list of ingredients with amounts and units

Return the data in this exact JSON format:
{
  "instructions": ["step 1", "step 2", ...],
  "ingredients": [
    {"name": "ingredient name", "amount": "quantity", "unit": "measurement unit"},
    ...
  ]
}

Content to analyze:
${content.substring(0, 4000)}

Focus on:
- Clear cooking steps in logical order
- Ingredients with proper measurements
- Ignore advertisements, comments, or unrelated content
- If amounts are written as fractions, convert to decimal (e.g., "1/2" -> "0.5")
- Common units: cups, tsp, tbsp, oz, lbs, g, kg, ml, l, pieces, cloves

JSON Response:`;

    try {
      // For now, use intelligent parsing as a fallback until proper AI is integrated
      return this.intelligentParse(content);
    } catch (error) {
      console.error('AI extraction failed, falling back to intelligent parsing:', error);
      return this.intelligentParse(content);
    }
  }

  private static intelligentParse(content: string): {
    instructions: string[];
    ingredients: Array<{ name: string; amount: string; unit: string }>;
  } {
    const instructions: string[] = [];
    const ingredients: Array<{ name: string; amount: string; unit: string }> = [];

    // Split content into lines for analysis
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    
    // Enhanced instruction detection
    const instructionKeywords = [
      'heat', 'cook', 'bake', 'fry', 'boil', 'simmer', 'mix', 'stir', 'add', 
      'combine', 'whisk', 'blend', 'chop', 'dice', 'slice', 'melt', 'pour',
      'season', 'taste', 'serve', 'garnish', 'preheat', 'remove', 'set aside',
      'drain', 'rinse', 'cover', 'uncover', 'reduce', 'increase', 'transfer'
    ];

    // Enhanced ingredient detection with better regex
    const ingredientRegex = /(?:^|\n)\s*(?:\*|-|\•|\d+\.?)?\s*(\d+(?:[\/\.\d]*)?)\s*(cups?|cup|tablespoons?|tbsp|teaspoons?|tsp|ounces?|oz|pounds?|lbs?|lb|grams?|g|kilograms?|kg|milliliters?|ml|liters?|l|cloves?|pieces?|slices?|large|medium|small|whole|can|cans|package|packages|jar|jars)\s+(?:of\s+)?(.+?)(?=\n|$|,|\()/gim;

    // Look for structured recipe sections
    let inInstructionsSection = false;
    let inIngredientsSection = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      const originalLine = lines[i];

      // Detect section headers
      if (line.includes('instruction') || line.includes('method') || line.includes('direction') || line.includes('steps')) {
        inInstructionsSection = true;
        inIngredientsSection = false;
        continue;
      }
      
      if (line.includes('ingredient') || line.includes('you will need') || line.includes('shopping list')) {
        inIngredientsSection = true;
        inInstructionsSection = false;
        continue;
      }

      // Extract instructions
      if (inInstructionsSection && originalLine.length > 10) {
        if (/^\d+\./.test(originalLine) || 
            instructionKeywords.some(keyword => line.includes(keyword))) {
          instructions.push(originalLine.replace(/^\d+\.\s*/, ''));
        }
      } else if (!inIngredientsSection && originalLine.length > 20 && originalLine.length < 200) {
        // Look for instruction-like sentences
        const hasInstructionWords = instructionKeywords.some(keyword => line.includes(keyword));
        const hasNumbers = /\d+/.test(originalLine);
        const isCapitalized = /^[A-Z]/.test(originalLine);
        
        if (hasInstructionWords && (hasNumbers || isCapitalized)) {
          instructions.push(originalLine);
        }
      }

      // Extract ingredients
      if (inIngredientsSection || (!inInstructionsSection && ingredients.length < 20)) {
        let match;
        const lineToTest = originalLine;
        ingredientRegex.lastIndex = 0; // Reset regex
        
        while ((match = ingredientRegex.exec(lineToTest)) !== null) {
          const amount = match[1].trim();
          const unit = match[2].trim();
          const name = match[3].trim().replace(/[^\w\s-]/g, '').trim();
          
          if (name.length > 1 && name.length < 50 && !name.toLowerCase().includes('step')) {
            ingredients.push({
              name: name.charAt(0).toUpperCase() + name.slice(1),
              amount: amount,
              unit: unit
            });
          }
        }
      }
    }

    // Clean up and deduplicate
    const uniqueInstructions = [...new Set(instructions)]
      .filter(inst => inst.length > 10 && inst.length < 300)
      .slice(0, 15);

    const uniqueIngredients = ingredients
      .filter((ing, index, self) => 
        index === self.findIndex(i => i.name.toLowerCase() === ing.name.toLowerCase())
      )
      .slice(0, 20);

    return {
      instructions: uniqueInstructions,
      ingredients: uniqueIngredients
    };
  }
}