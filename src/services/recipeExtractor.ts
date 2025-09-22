interface RecipeExtractionResult {
  success: boolean;
  instructions?: string[];
  ingredients?: Array<{ name: string; amount: string; unit: string }>;
  error?: string;
}

export class RecipeExtractorService {
  static async extractFromUrl(url: string): Promise<RecipeExtractionResult> {
    try {
      // Fetch the website content
      const response = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch website content');
      }

      const data = await response.json();
      const htmlContent = data.contents;

      // Extract text content from HTML
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, 'text/html');
      
      // Remove script and style elements
      const scripts = doc.querySelectorAll('script, style');
      scripts.forEach(el => el.remove());
      
      // Get text content
      const textContent = doc.body?.textContent || doc.textContent || '';
      
      // Use a simple AI prompt to extract recipe information
      const extractedData = await this.parseRecipeContent(textContent);
      
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

  private static async parseRecipeContent(content: string): Promise<{
    instructions: string[];
    ingredients: Array<{ name: string; amount: string; unit: string }>;
  }> {
    // Simple regex-based extraction for common patterns
    const instructions: string[] = [];
    const ingredients: Array<{ name: string; amount: string; unit: string }> = [];

    // Extract instructions (look for numbered or bullet points)
    const instructionRegex = /(?:^|\n)\s*(?:\d+\.|\*|-|\•)\s*(.+?)(?=\n|$)/gm;
    let match;
    while ((match = instructionRegex.exec(content)) !== null) {
      const instruction = match[1].trim();
      if (instruction.length > 10 && instruction.length < 300) {
        instructions.push(instruction);
      }
    }

    // Extract ingredients (look for common patterns like "2 cups flour")
    const ingredientRegex = /(?:^|\n)\s*(?:\*|-|\•)?\s*(\d+(?:\/\d+)?(?:\.\d+)?)\s*(cups?|tbsp|tsp|oz|lbs?|g|kg|ml|l|cloves?|pieces?|slices?)\s+(.+?)(?=\n|$)/gim;
    while ((match = ingredientRegex.exec(content)) !== null) {
      const amount = match[1].trim();
      const unit = match[2].trim();
      const name = match[3].trim();
      
      if (name.length > 2 && name.length < 100) {
        ingredients.push({
          name: name.replace(/[^\w\s-]/g, '').trim(),
          amount,
          unit
        });
      }
    }

    // If no structured instructions found, look for paragraphs that seem like instructions
    if (instructions.length === 0) {
      const paragraphs = content.split('\n').filter(p => p.trim().length > 20);
      paragraphs.forEach(paragraph => {
        if (paragraph.toLowerCase().includes('cook') || 
            paragraph.toLowerCase().includes('bake') || 
            paragraph.toLowerCase().includes('mix') ||
            paragraph.toLowerCase().includes('add') ||
            paragraph.toLowerCase().includes('heat')) {
          instructions.push(paragraph.trim());
        }
      });
    }

    return { instructions: instructions.slice(0, 20), ingredients: ingredients.slice(0, 20) };
  }
}