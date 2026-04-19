const { createClient } = require('@supabase/supabase-js');

/**
 * These variables must be set in your Railway 'Variables' tab:
 * 1. SUPABASE_URL: Your Project URL from Settings > API
 * 2. SUPABASE_KEY: Your 'anon' public key from Settings > API
 */
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Safety check to ensure environment variables are loaded
if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables. Check your Railway settings!");
}

const supabase = createClient(supabaseUrl, supabaseKey);

// We export the client so you can use it in any other file
module.exports = supabase;