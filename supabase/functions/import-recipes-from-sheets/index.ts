import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Starting scheduled recipe import from Google Sheets...');

    const GOOGLE_SHEETS_API_KEY = Deno.env.get('GOOGLE_SHEETS_API_KEY');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!GOOGLE_SHEETS_API_KEY) {
      throw new Error('GOOGLE_SHEETS_API_KEY not configured');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Supabase credentials not configured');
    }

    // Initialize Supabase client with service role key for admin access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get spreadsheet ID from request body or use default
    const { spreadsheetId, sheetName = 'Sheet1' } = await req.json().catch(() => ({}));
    
    if (!spreadsheetId) {
      throw new Error('Spreadsheet ID is required');
    }

    console.log(`Fetching recipes from Google Sheets: ${spreadsheetId}, sheet: ${sheetName}`);

    // Fetch data from Google Sheets
    const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${sheetName}?key=${GOOGLE_SHEETS_API_KEY}`;
    const sheetsResponse = await fetch(sheetsUrl);

    if (!sheetsResponse.ok) {
      const errorText = await sheetsResponse.text();
      console.error('Google Sheets API error:', errorText);
      throw new Error(`Failed to fetch Google Sheets data: ${sheetsResponse.status}`);
    }

    const sheetsData = await sheetsResponse.json();
    const rows = sheetsData.values || [];

    if (rows.length === 0) {
      console.log('No data found in Google Sheets');
      return new Response(
        JSON.stringify({ success: true, message: 'No data found', imported: 0, skipped: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${rows.length} rows in Google Sheets`);

    // Assume first row is header, skip it
    const dataRows = rows.slice(1);
    let imported = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of dataRows) {
      const url = row[0]?.trim(); // Assume URL is in first column

      if (!url || !url.startsWith('http')) {
        console.log('Skipping invalid URL:', url);
        skipped++;
        continue;
      }

      try {
        // Check if URL has already been processed
        const { data: existing, error: checkError } = await supabase
          .from('imported_recipe_urls')
          .select('id, status')
          .eq('url', url)
          .maybeSingle();

        if (checkError) {
          console.error('Error checking existing URL:', checkError);
          failed++;
          continue;
        }

        if (existing) {
          console.log('URL already processed:', url, 'status:', existing.status);
          skipped++;
          continue;
        }

        // Insert URL as pending
        const { data: urlRecord, error: insertError } = await supabase
          .from('imported_recipe_urls')
          .insert({ url, status: 'pending' })
          .select()
          .single();

        if (insertError) {
          console.error('Error inserting URL record:', insertError);
          failed++;
          continue;
        }

        console.log('Extracting recipe from:', url);

        // Call extract-recipe function
        const { data: extractData, error: extractError } = await supabase.functions.invoke('extract-recipe', {
          body: { url }
        });

        if (extractError || !extractData?.success) {
          const errorMsg = extractError?.message || extractData?.error || 'Unknown extraction error';
          console.error('Failed to extract recipe:', errorMsg);
          
          await supabase
            .from('imported_recipe_urls')
            .update({ status: 'failed', error_message: errorMsg })
            .eq('id', urlRecord.id);
          
          failed++;
          continue;
        }

        // Create recipe from extracted data
        const recipeData = {
          title: extractTitle(url), // Extract title from URL or use domain
          description: '',
          image: '',
          rating: 0,
          tags: [],
          instructions: extractData.instructions || [],
          cook_time: 0,
          servings: 1,
          website_url: url,
          youtube_url: url.includes('youtube.com') || url.includes('youtu.be') ? url : null,
          calories: null
        };

        const { data: newRecipe, error: recipeError } = await supabase
          .from('recipes')
          .insert(recipeData)
          .select()
          .single();

        if (recipeError) {
          console.error('Error creating recipe:', recipeError);
          await supabase
            .from('imported_recipe_urls')
            .update({ status: 'failed', error_message: recipeError.message })
            .eq('id', urlRecord.id);
          
          failed++;
          continue;
        }

        // Insert ingredients
        const structuredIngredients = extractData.structuredIngredients || [];
        if (structuredIngredients.length > 0) {
          const { error: ingredientsError } = await supabase
            .from('ingredients')
            .insert(
              structuredIngredients.map((ing: any) => ({
                recipe_id: newRecipe.id,
                name: ing.name || '',
                amount: ing.amount || '',
                unit: ing.unit || ''
              }))
            );

          if (ingredientsError) {
            console.error('Error inserting ingredients:', ingredientsError);
          }
        }

        // Update URL record with success
        await supabase
          .from('imported_recipe_urls')
          .update({ 
            status: 'success', 
            recipe_id: newRecipe.id,
            imported_at: new Date().toISOString()
          })
          .eq('id', urlRecord.id);

        console.log('Successfully imported recipe:', newRecipe.id);
        imported++;

      } catch (error) {
        console.error('Error processing URL:', url, error);
        failed++;
      }
    }

    const result = {
      success: true,
      message: `Processed ${dataRows.length} URLs`,
      imported,
      skipped,
      failed
    };

    console.log('Import complete:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in import-recipes-from-sheets function:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

// Helper function to extract title from URL
function extractTitle(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(p => p.length > 0);
    
    if (pathParts.length > 0) {
      // Get last path segment and clean it up
      const lastPart = pathParts[pathParts.length - 1];
      return lastPart
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, '') // Remove file extension
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }
    
    return urlObj.hostname.replace('www.', '');
  } catch {
    return 'Imported Recipe';
  }
}
