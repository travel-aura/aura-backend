import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load the .env variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase Environment Variables!');
}

// Create the God-Mode client for the backend
// Service role key bypasses RLS by default
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// Sign-in, sign-up and Google sign-in store the user's session on the client
// they run on. If they ran on the shared admin client above, every later
// database call from this server would run as that user instead of the
// service role. So each of those calls gets its own throwaway client.
export function createAuthClient() {
  return createClient(supabaseUrl!, supabaseKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
